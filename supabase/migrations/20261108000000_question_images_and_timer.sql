-- =============================================================================
-- Migration : Images des questions, chronomètre par question, et correction ordre shuffle
-- =============================================================================

-- 1. Nouvelles colonnes
alter table public.quizzes
  add column if not exists question_duration_seconds integer default null;

alter table public.questions
  add column if not exists image_url text default null,
  add column if not exists duration_seconds integer default null;

-- 2. Configuration Supabase Storage pour les images des questions
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do update set public = true;

-- Droits de lecture publique pour tout le monde (les candidats doivent voir les images)
drop policy if exists "Images questions publiques" on storage.objects;
create policy "Images questions publiques"
  on storage.objects for select
  using (bucket_id = 'question-images');

-- Droits d'écriture/modification/suppression pour les administrateurs
drop policy if exists "Upload images questions admin" on storage.objects;
create policy "Upload images questions admin"
  on storage.objects for insert
  with check (bucket_id = 'question-images' and public.is_admin());

drop policy if exists "Modification images questions admin" on storage.objects;
create policy "Modification images questions admin"
  on storage.objects for update
  using (bucket_id = 'question-images' and public.is_admin());

drop policy if exists "Suppression images questions admin" on storage.objects;
create policy "Suppression images questions admin"
  on storage.objects for delete
  using (bucket_id = 'question-images' and public.is_admin());

-- 3. Mise à jour de la RPC save_question pour enregistrer image_url et duration_seconds
create or replace function public.save_question(
  p_quiz_id          uuid,
  p_question_id      uuid,
  p_statement        text,
  p_points           numeric,
  p_choices          jsonb,
  p_image_url        text default null,
  p_duration_seconds integer default null
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
    insert into public.questions (quiz_id, statement, points, image_url, duration_seconds, position)
    values (
      p_quiz_id,
      btrim(p_statement),
      p_points,
      p_image_url,
      p_duration_seconds,
      coalesce((select max(position) + 1 from public.questions where quiz_id = p_quiz_id), 0)
    )
    returning id into v_id;
  else
    update public.questions
       set statement        = btrim(p_statement),
           points           = p_points,
           image_url        = p_image_url,
           duration_seconds = p_duration_seconds
     where id = p_question_id and quiz_id = p_quiz_id
    returning id into v_id;
    if v_id is null then
      raise exception 'QUESTION_NOT_FOUND';
    end if;
  end if;

  -- upsert par position : les identifiants des choix sont conservés
  for v_choice in select value from jsonb_array_elements(p_choices) loop
    v_pos := v_pos + 1;
    insert into public.choices (question_id, label, is_correct, position)
    values (v_id, btrim(v_choice ->> 'label'), (v_choice ->> 'isCorrect')::boolean, v_pos)
    on conflict (question_id, position)
    do update set label = excluded.label, is_correct = excluded.is_correct;
  end loop;

  return v_id;
end $$;

-- 4. Mise à jour de get_attempt_session pour inclure imageUrl et durationSeconds
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
    'attemptId',               v_attempt.id,
    'quizId',                  v_quiz.id,
    'quizTitle',               v_quiz.title,
    'status',                  v_attempt.status,
    'startedAt',               v_attempt.started_at,
    'expiresAt',               v_attempt.expires_at,
    'durationSeconds',         v_quiz.duration_seconds,
    'questionDurationSeconds', v_quiz.question_duration_seconds,
    'serverNow',               clock_timestamp(),
    'questions', case when v_attempt.status <> 'in_progress' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',              q.id,
               'statement',       q.statement,
               'points',          q.points,
               'imageUrl',        q.image_url,
               'durationSeconds', coalesce(q.duration_seconds, v_quiz.question_duration_seconds, null),
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

-- 5. Mise à jour de get_attempt_result :
--    - Inclut imageUrl
--    - CORRECTION DU BUG D'INVERSION : utilise le même ordre déterministe (shuffle) que pendant le test !
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
               'imageUrl',  q.image_url,
               'choices', (
                 select jsonb_agg(jsonb_build_object(
                          'id',        c.id,
                          'label',     c.label,
                          'isCorrect', c.is_correct,
                          'selected',  exists (select 1 from public.attempt_answers aa
                                                where aa.attempt_id = v_attempt.id and aa.choice_id = c.id)
                        ) order by case when v_quiz.shuffle then md5(v_attempt.id::text || c.id::text)
                                        else lpad(c.position::text, 10, '0') end)
                   from public.choices c where c.question_id = q.id)
             ) order by case when v_quiz.shuffle then md5(v_attempt.id::text || q.id::text)
                             else lpad(q.position::text, 10, '0') end)
        from public.questions q where q.quiz_id = v_quiz.id), '[]'::jsonb) end
  );
end $$;

