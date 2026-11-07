-- =============================================================================
--  QCM — Schéma Supabase
--  Règles métier garanties CÔTÉ SERVEUR (le client n'est jamais digne de confiance) :
--    * une question possède exactement 4 choix, dont 1 à 3 corrects ;
--    * un candidat ne voit JAMAIS les bonnes réponses pendant le test ;
--    * le temps est mesuré par le serveur (expires_at), pas par le navigateur ;
--    * la note est calculée par le serveur.
-- =============================================================================

create schema if not exists internal;              -- non exposé par l'API REST
revoke all on schema internal from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.app_role       as enum ('admin', 'candidate');
create type public.scoring_mode   as enum ('all_or_nothing', 'partial');
create type public.attempt_status as enum ('in_progress', 'submitted', 'expired');

-- -----------------------------------------------------------------------------
-- Profils (rôle admin / candidat)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       public.app_role not null default 'candidate',
  created_at timestamptz not null default now()
);

create or replace function internal.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function internal.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- -----------------------------------------------------------------------------
-- Tests (quizzes)
-- -----------------------------------------------------------------------------
create table public.quizzes (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(btrim(title)) between 3 and 200),
  description      text not null default '',
  duration_seconds integer not null check (duration_seconds between 60 and 86400),
  scoring_mode     public.scoring_mode not null default 'all_or_nothing',
  max_attempts     smallint not null default 1 check (max_attempts between 1 and 20),
  show_correction  boolean not null default true,
  shuffle          boolean not null default true,
  is_published     boolean not null default false,
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  statement  text not null check (char_length(btrim(statement)) between 1 and 2000),
  points     numeric(6, 2) not null default 1 check (points > 0 and points <= 100),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index questions_quiz_idx on public.questions (quiz_id, position);

create table public.choices (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 500),
  is_correct  boolean not null,
  position    smallint not null check (position between 1 and 4),
  unique (question_id, position)
);

-- -----------------------------------------------------------------------------
-- Tentatives
-- -----------------------------------------------------------------------------
create table public.attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  status       public.attempt_status not null default 'in_progress',
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  submitted_at timestamptz,
  score        numeric(8, 2),
  max_score    numeric(8, 2)
);
-- Une seule tentative en cours par candidat et par test
create unique index attempts_one_in_progress
  on public.attempts (quiz_id, user_id) where status = 'in_progress';

create table public.attempt_answers (
  attempt_id  uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  choice_id   uuid not null references public.choices (id) on delete cascade,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, choice_id)
);
create index attempt_answers_q_idx on public.attempt_answers (attempt_id, question_id);

-- =============================================================================
--  Invariants
-- =============================================================================

-- Invariant « 4 choix, 1 à 3 corrects » vérifié en fin de transaction (DEFERRABLE)
create or replace function internal.assert_question_choices()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_qid     uuid;
  v_total   int;
  v_correct int;
begin
  if tg_table_name = 'questions' then
    v_qid := new.id;
  else
    v_qid := coalesce(new.question_id, old.question_id);
  end if;

  if not exists (select 1 from public.questions where id = v_qid) then
    return null; -- question supprimée (cascade)
  end if;

  select count(*), count(*) filter (where is_correct)
    into v_total, v_correct
    from public.choices where question_id = v_qid;

  if v_total <> 4 then
    raise exception 'QUESTION_MUST_HAVE_4_CHOICES' using errcode = 'check_violation';
  end if;
  if v_correct not between 1 and 3 then
    raise exception 'QUESTION_CORRECT_COUNT_1_TO_3' using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger questions_choices_integrity
  after insert on public.questions
  deferrable initially deferred
  for each row execute function internal.assert_question_choices();

create constraint trigger choices_integrity
  after insert or update or delete on public.choices
  deferrable initially deferred
  for each row execute function internal.assert_question_choices();

-- Un test publié doit contenir au moins une question
create or replace function internal.guard_quiz()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_published and not exists (select 1 from public.questions where quiz_id = new.id) then
    raise exception 'QUIZ_EMPTY' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger quizzes_guard
  before insert or update on public.quizzes
  for each row execute function internal.guard_quiz();

-- =============================================================================
--  Notation (stratégies identiques à src/domain/scoring)
-- =============================================================================
create or replace function internal.grace_period()
returns interval language sql immutable as $$ select interval '5 seconds' $$;

create or replace function internal.compute_max_score(p_quiz_id uuid)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(points), 0) from public.questions where quiz_id = p_quiz_id;
$$;

create or replace function internal.compute_score(p_attempt_id uuid)
returns numeric language sql stable set search_path = public as $$
  with ctx as (
    select a.quiz_id, z.scoring_mode
      from public.attempts a join public.quizzes z on z.id = a.quiz_id
     where a.id = p_attempt_id
  ),
  per_question as (
    select q.points,
           count(*) filter (where c.is_correct)                               as nb_correct,
           count(*) filter (where c.is_correct and aa.choice_id is not null)     as hits,
           count(*) filter (where not c.is_correct and aa.choice_id is not null) as wrongs
      from ctx
      join public.questions q on q.quiz_id = ctx.quiz_id
      join public.choices   c on c.question_id = q.id
      left join public.attempt_answers aa
             on aa.attempt_id = p_attempt_id and aa.choice_id = c.id
     group by q.id, q.points
  )
  select coalesce(sum(
           case (select scoring_mode from ctx)
             when 'all_or_nothing' then
               case when hits = nb_correct and wrongs = 0 then points else 0 end
             else
               round(points * greatest(0, (hits - wrongs)::numeric / nb_correct), 2)
           end), 0)
    from per_question;
$$;

-- Clôture une tentative (soumission ou expiration) — idempotent
create or replace function internal.close_attempt(p_attempt_id uuid)
returns public.attempts language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts;
begin
  update public.attempts a
     set status       = case when now() > a.expires_at + internal.grace_period()
                             then 'expired'::public.attempt_status
                             else 'submitted'::public.attempt_status end,
         submitted_at = least(now(), a.expires_at),
         score        = internal.compute_score(a.id),
         max_score    = internal.compute_max_score(a.quiz_id)
   where a.id = p_attempt_id and a.status = 'in_progress'
  returning * into v_attempt;

  if v_attempt.id is null then
    select * into v_attempt from public.attempts where id = p_attempt_id;
  end if;
  return v_attempt;
end $$;

create or replace function internal.finalize_expired_attempts(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id from public.attempts
     where status = 'in_progress'
       and now() > expires_at + internal.grace_period()
       and (p_user_id is null or user_id = p_user_id)
     for update skip locked
  loop
    perform internal.close_attempt(r.id);
  end loop;
end $$;

-- =============================================================================
--  RPC — Administration
-- =============================================================================

-- Enregistre une question + ses 4 choix de façon atomique.
-- p_choices : [{ "label": "...", "isCorrect": true }, ...] (exactement 4, dans l'ordre)
create or replace function public.save_question(
  p_quiz_id     uuid,
  p_question_id uuid,
  p_statement   text,
  p_points      numeric,
  p_choices     jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id     uuid;
  v_choice jsonb;
  v_pos    int := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) <> 4 then
    raise exception 'QUESTION_MUST_HAVE_4_CHOICES' using errcode = 'check_violation';
  end if;

  if p_question_id is null then
    insert into public.questions (quiz_id, statement, points, position)
    values (p_quiz_id, btrim(p_statement), p_points,
            coalesce((select max(position) + 1 from public.questions where quiz_id = p_quiz_id), 0))
    returning id into v_id;
  else
    update public.questions
       set statement = btrim(p_statement), points = p_points
     where id = p_question_id and quiz_id = p_quiz_id
    returning id into v_id;
    if v_id is null then
      raise exception 'QUESTION_NOT_FOUND';
    end if;
  end if;

  -- upsert par position : les identifiants des choix sont conservés (historique des réponses intact)
  for v_choice in select value from jsonb_array_elements(p_choices) loop
    v_pos := v_pos + 1;
    insert into public.choices (question_id, label, is_correct, position)
    values (v_id, btrim(v_choice ->> 'label'), (v_choice ->> 'isCorrect')::boolean, v_pos)
    on conflict (question_id, position)
    do update set label = excluded.label, is_correct = excluded.is_correct;
  end loop;

  return v_id;
end $$;

-- =============================================================================
--  RPC — Candidat
-- =============================================================================

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
   where z.is_published
   order by z.created_at desc;
end $$;

-- Démarre (ou reprend) une tentative. Le chronomètre est fixé par le serveur.
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

  select * into v_quiz from public.quizzes where id = p_quiz_id and is_published;
  if not found then
    raise exception 'QUIZ_NOT_AVAILABLE';
  end if;

  perform internal.finalize_expired_attempts(auth.uid());

  select * into v_attempt from public.attempts
   where quiz_id = p_quiz_id and user_id = auth.uid() and status = 'in_progress';
  if found then
    return v_attempt.id; -- reprise : le temps continue de s'écouler
  end if;

  select count(*) into v_used from public.attempts
   where quiz_id = p_quiz_id and user_id = auth.uid();
  if v_used >= v_quiz.max_attempts then
    raise exception 'MAX_ATTEMPTS_REACHED';
  end if;

  insert into public.attempts (quiz_id, user_id, expires_at)
  values (p_quiz_id, auth.uid(), now() + make_interval(secs => v_quiz.duration_seconds))
  returning * into v_attempt;

  return v_attempt.id;
end $$;

-- Questions de la tentative SANS les bonnes réponses, ordre mélangé de façon déterministe
create or replace function public.get_attempt_session(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts;
  v_quiz    public.quizzes;
begin
  perform internal.finalize_expired_attempts(auth.uid());

  select * into v_attempt from public.attempts where id = p_attempt_id and user_id = auth.uid();
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;
  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  return jsonb_build_object(
    'attemptId',       v_attempt.id,
    'quizId',          v_quiz.id,
    'quizTitle',       v_quiz.title,
    'status',          v_attempt.status,
    'startedAt',       v_attempt.started_at,
    'expiresAt',       v_attempt.expires_at,
    'durationSeconds', v_quiz.duration_seconds,
    'serverNow',       clock_timestamp(),
    'questions', case when v_attempt.status <> 'in_progress' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        q.id,
               'statement', q.statement,
               'points',    q.points,
               'choices', (
                 select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label)
                        order by case when v_quiz.shuffle then md5(v_attempt.id::text || c.id::text)
                                      else lpad(c.position::text, 10, '0') end)
                   from public.choices c where c.question_id = q.id),
               'selectedChoiceIds', coalesce((
                 select jsonb_agg(aa.choice_id) from public.attempt_answers aa
                  where aa.attempt_id = v_attempt.id and aa.question_id = q.id), '[]'::jsonb)
             ) order by case when v_quiz.shuffle then md5(v_attempt.id::text || q.id::text)
                             else lpad(q.position::text, 10, '0') end)
        from public.questions q where q.quiz_id = v_quiz.id), '[]'::jsonb) end
  );
end $$;

-- Sauvegarde (remplace) la sélection d'une question — appelée en auto-save
create or replace function public.save_answer(
  p_attempt_id  uuid,
  p_question_id uuid,
  p_choice_ids  uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts;
begin
  select * into v_attempt from public.attempts
   where id = p_attempt_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'ATTEMPT_CLOSED';
  end if;
  if now() > v_attempt.expires_at + internal.grace_period() then
    raise exception 'ATTEMPT_EXPIRED';
  end if;
  if not exists (select 1 from public.questions where id = p_question_id and quiz_id = v_attempt.quiz_id) then
    raise exception 'QUESTION_NOT_IN_QUIZ';
  end if;
  if coalesce(cardinality(p_choice_ids), 0) > 3 then
    raise exception 'TOO_MANY_CHOICES';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_choice_ids, '{}')) as cid
     where not exists (select 1 from public.choices c where c.id = cid and c.question_id = p_question_id)
  ) then
    raise exception 'INVALID_CHOICE';
  end if;

  delete from public.attempt_answers where attempt_id = p_attempt_id and question_id = p_question_id;
  insert into public.attempt_answers (attempt_id, question_id, choice_id)
  select p_attempt_id, p_question_id, cid from unnest(coalesce(p_choice_ids, '{}')) as cid;
end $$;

create or replace function public.submit_attempt(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts;
begin
  select * into v_attempt from public.attempts
   where id = p_attempt_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  v_attempt := internal.close_attempt(p_attempt_id);

  return jsonb_build_object(
    'attemptId',   v_attempt.id,
    'status',      v_attempt.status,
    'score',       v_attempt.score,
    'maxScore',    v_attempt.max_score,
    'submittedAt', v_attempt.submitted_at
  );
end $$;

-- Résultat + correction (si autorisée par le test, ou pour un admin)
create or replace function public.get_attempt_result(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts;
  v_quiz    public.quizzes;
  v_reveal  boolean;
begin
  select * into v_attempt from public.attempts
   where id = p_attempt_id and (user_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status = 'in_progress' then
    if now() > v_attempt.expires_at + internal.grace_period() then
      v_attempt := internal.close_attempt(v_attempt.id);
    else
      raise exception 'ATTEMPT_IN_PROGRESS';
    end if;
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;
  v_reveal := v_quiz.show_correction or public.is_admin();

  return jsonb_build_object(
    'attemptId',      v_attempt.id,
    'quizId',         v_quiz.id,
    'quizTitle',      v_quiz.title,
    'scoringMode',    v_quiz.scoring_mode,
    'status',         v_attempt.status,
    'score',          v_attempt.score,
    'maxScore',       v_attempt.max_score,
    'startedAt',      v_attempt.started_at,
    'submittedAt',    v_attempt.submitted_at,
    'showCorrection', v_reveal,
    'questions', case when not v_reveal then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        q.id,
               'statement', q.statement,
               'points',    q.points,
               'choices', (
                 select jsonb_agg(jsonb_build_object(
                          'id',        c.id,
                          'label',     c.label,
                          'isCorrect', c.is_correct,
                          'selected',  exists (select 1 from public.attempt_answers aa
                                                where aa.attempt_id = v_attempt.id and aa.choice_id = c.id)
                        ) order by c.position)
                   from public.choices c where c.question_id = q.id)
             ) order by q.position)
        from public.questions q where q.quiz_id = v_quiz.id), '[]'::jsonb) end
  );
end $$;

-- =============================================================================
--  Row Level Security
-- =============================================================================
alter table public.profiles        enable row level security;
alter table public.quizzes         enable row level security;
alter table public.questions       enable row level security;
alter table public.choices         enable row level security;
alter table public.attempts        enable row level security;
alter table public.attempt_answers enable row level security;

create policy profiles_select      on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy quizzes_read  on public.quizzes for select using (public.is_admin() or (is_published and auth.uid() is not null));
create policy quizzes_admin on public.quizzes for all    using (public.is_admin()) with check (public.is_admin());

-- Les candidats n'accèdent JAMAIS directement aux questions/choix (passage par les RPC)
create policy questions_admin on public.questions for all using (public.is_admin()) with check (public.is_admin());
create policy choices_admin   on public.choices   for all using (public.is_admin()) with check (public.is_admin());

-- Aucune écriture directe : uniquement via start_attempt / save_answer / submit_attempt
create policy attempts_read on public.attempts for select using (user_id = auth.uid() or public.is_admin());
create policy answers_read  on public.attempt_answers for select using (
  exists (select 1 from public.attempts a
           where a.id = attempt_id and (a.user_id = auth.uid() or public.is_admin()))
);

-- =============================================================================
--  Droits d'exécution des RPC
-- =============================================================================
revoke execute on all functions in schema public from public, anon;
grant  execute on function public.is_admin()                                       to authenticated;
grant  execute on function public.save_question(uuid, uuid, text, numeric, jsonb)  to authenticated;
grant  execute on function public.list_available_quizzes()                         to authenticated;
grant  execute on function public.start_attempt(uuid)                              to authenticated;
grant  execute on function public.get_attempt_session(uuid)                        to authenticated;
grant  execute on function public.save_answer(uuid, uuid, uuid[])                  to authenticated;
grant  execute on function public.submit_attempt(uuid)                             to authenticated;
grant  execute on function public.get_attempt_result(uuid)                         to authenticated;

-- -----------------------------------------------------------------------------
-- Promouvoir le premier administrateur (à exécuter manuellement) :
--   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'vous@exemple.com');
-- -----------------------------------------------------------------------------
