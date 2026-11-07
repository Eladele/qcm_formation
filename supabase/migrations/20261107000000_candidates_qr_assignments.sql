-- =============================================================================
--  Candidats, connexion par QR code, affectation des tests
--
--  * Les candidats sont créés par l'admin (Edge Function admin-candidates).
--  * Chaque candidat possède un jeton QR : seul son HASH SHA-256 est stocké.
--    Le jeton en clair n'existe que dans le QR imprimé.
--  * Un test lancé n'est visible que par les candidats qui y sont affectés.
-- =============================================================================

alter table public.profiles
  add column if not exists phone     text,
  add column if not exists is_active boolean not null default true;

-- -----------------------------------------------------------------------------
-- Jetons de connexion QR (accessibles uniquement par le service_role)
-- -----------------------------------------------------------------------------
create table public.login_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
-- Un seul QR valide par candidat : en régénérer un invalide l'ancien
create unique index login_tokens_one_active on public.login_tokens (user_id) where revoked_at is null;

alter table public.login_tokens enable row level security;
-- Aucune policy : ni anon ni authenticated n'y ont accès. Seules les Edge Functions (service_role).

-- Désactiver un candidat révoque son QR
create or replace function internal.revoke_tokens_on_deactivate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_active and not new.is_active then
    update public.login_tokens set revoked_at = now() where user_id = new.id and revoked_at is null;
  end if;
  return new;
end $$;

create trigger profiles_deactivate
  after update of is_active on public.profiles
  for each row execute function internal.revoke_tokens_on_deactivate();

-- -----------------------------------------------------------------------------
-- Affectation des tests aux candidats
-- -----------------------------------------------------------------------------
create table public.quiz_assignments (
  quiz_id     uuid not null references public.quizzes (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (quiz_id, user_id)
);
create index quiz_assignments_user_idx on public.quiz_assignments (user_id);

alter table public.quiz_assignments enable row level security;
create policy assignments_admin on public.quiz_assignments for all using (public.is_admin()) with check (public.is_admin());
create policy assignments_own   on public.quiz_assignments for select using (user_id = auth.uid());

-- Remplace l'affectation d'un test en une transaction
create or replace function public.set_quiz_assignments(p_quiz_id uuid, p_user_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.quiz_assignments
   where quiz_id = p_quiz_id and not (user_id = any (coalesce(p_user_ids, '{}')));
  insert into public.quiz_assignments (quiz_id, user_id)
  select p_quiz_id, uid from unnest(coalesce(p_user_ids, '{}')) as uid
  on conflict do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- Liste des candidats pour l'admin (avec l'état du QR, sans jamais exposer le hash)
-- -----------------------------------------------------------------------------
create or replace function public.list_candidates()
returns table (
  id            uuid,
  full_name     text,
  phone         text,
  is_active     boolean,
  created_at    timestamptz,
  has_active_qr boolean,
  last_login_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select p.id, p.full_name, p.phone, p.is_active, p.created_at,
         exists (select 1 from public.login_tokens t where t.user_id = p.id and t.revoked_at is null),
         (select max(t.last_used_at) from public.login_tokens t where t.user_id = p.id)
    from public.profiles p
   where p.role = 'candidate'
   order by p.full_name;
end $$;

-- -----------------------------------------------------------------------------
-- Le catalogue et le démarrage tiennent compte de l'affectation et du statut actif
-- -----------------------------------------------------------------------------
create or replace function public.list_available_quizzes()
returns table (
  id                     uuid,
  title                  text,
  description            text,
  duration_seconds       integer,
  question_count         bigint,
  max_attempts           smallint,
  attempts_used          bigint,
  in_progress_attempt_id uuid,
  last_attempt_id        uuid,
  best_score             numeric,
  max_score              numeric
) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform internal.finalize_expired_attempts(auth.uid());
  return query
  select z.id, z.title, z.description, z.duration_seconds,
         (select count(*) from public.questions q where q.quiz_id = z.id),
         z.max_attempts,
         (select count(*) from public.attempts a where a.quiz_id = z.id and a.user_id = auth.uid()),
         (select a.id from public.attempts a
           where a.quiz_id = z.id and a.user_id = auth.uid() and a.status = 'in_progress' limit 1),
         (select a.id from public.attempts a
           where a.quiz_id = z.id and a.user_id = auth.uid() and a.status <> 'in_progress'
           order by a.submitted_at desc limit 1),
         (select max(a.score) from public.attempts a
           where a.quiz_id = z.id and a.user_id = auth.uid() and a.status <> 'in_progress'),
         internal.compute_max_score(z.id)
    from public.quizzes z
    join public.quiz_assignments qa on qa.quiz_id = z.id and qa.user_id = auth.uid()
   where z.is_published
      -- un test clôturé reste visible si le candidat y a déjà un résultat
      or exists (select 1 from public.attempts a where a.quiz_id = z.id and a.user_id = auth.uid())
   order by qa.assigned_at desc;
end $$;

create or replace function public.start_attempt(p_quiz_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_quiz    public.quizzes;
  v_attempt public.attempts;
  v_used    int;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'CANDIDATE_INACTIVE';
  end if;
  if not exists (select 1 from public.quiz_assignments where quiz_id = p_quiz_id and user_id = auth.uid()) then
    raise exception 'NOT_ASSIGNED';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id and is_published;
  if not found then
    raise exception 'QUIZ_NOT_AVAILABLE';
  end if;

  perform internal.finalize_expired_attempts(auth.uid());

  select * into v_attempt from public.attempts
   where quiz_id = p_quiz_id and user_id = auth.uid() and status = 'in_progress';
  if found then
    return v_attempt.id;
  end if;

  select count(*) into v_used from public.attempts
   where quiz_id = p_quiz_id and user_id = auth.uid();
  if v_used >= v_quiz.max_attempts then
    raise exception 'MAX_ATTEMPTS_REACHED';
  end if;

  -- Le chronomètre démarre ICI, au clic du candidat sur « Commencer »
  insert into public.attempts (quiz_id, user_id, expires_at)
  values (p_quiz_id, auth.uid(), now() + make_interval(secs => v_quiz.duration_seconds))
  returning * into v_attempt;

  return v_attempt.id;
end $$;

revoke execute on function public.set_quiz_assignments(uuid, uuid[]) from public, anon;
revoke execute on function public.list_candidates()                 from public, anon;
grant  execute on function public.set_quiz_assignments(uuid, uuid[]) to authenticated;
grant  execute on function public.list_candidates()                 to authenticated;
