-- =============================================================================
--  EXEMPLE : test « Mathématiques — niveau simple » (10 questions, dont 8 avec image)
--
--  À exécuter dans Supabase → SQL Editor, APRÈS les 3 migrations.
--  Le script est ré-exécutable : il supprime puis recrée ce test (identifiant fixe).
--
--  Les images sont servies par l'application elle-même depuis public/exemples/maths/
--  (URL relative /exemples/maths/...). Elles s'affichent donc en local (npm run dev)
--  comme sur Vercel, sans rien téléverser dans Supabase Storage.
--
--  Le test est créé en BROUILLON : l'admin affecte les candidats puis clique « Lancer ».
-- =============================================================================

do $seed$
declare
  v_quiz uuid := '6d0b5c2e-9a8f-4d1e-b7c3-1a2b3c4d5e60';
  v_q    jsonb;
  v_c    jsonb;
  v_qid  uuid;
  v_pos  int := 0;
  v_cpos int;
begin
  delete from public.quizzes where id = v_quiz;  -- cascade : questions, choix, tentatives de cet exemple

  insert into public.quizzes (id, title, description, duration_seconds, scoring_mode,
                              max_attempts, show_correction, shuffle, is_published)
  values (
    v_quiz,
    'Mathématiques — niveau simple',
    'Lecture de graphiques, géométrie, fractions et nombres premiers. '
      || 'Chaque question a 4 propositions dont 1 à 3 sont correctes. Calculatrice non autorisée.',
    20 * 60,          -- 20 minutes
    'partial',        -- crédit partiel : chaque bonne case cochée rapporte, chaque mauvaise retire
    1,
    true,
    true,
    false
  );

  -- Format : { statement, points, image, choices: [[libellé, correct], ×4] }
  for v_q in select value from jsonb_array_elements($json$[
    {
      "statement": "Quelle est l'équation de la droite (d) représentée ci-dessous ?",
      "points": 1,
      "image": "/exemples/maths/q01-droite.svg",
      "choices": [["y = 2x + 1", true], ["y = x + 1", false], ["y = 2x − 1", false], ["y = ½x + 1", false]]
    },
    {
      "statement": "Voici la courbe Cf de la fonction f(x) = x² − 4x + 3. Quelles affirmations sont vraies ?",
      "points": 2,
      "image": "/exemples/maths/q02-parabole.svg",
      "choices": [
        ["f s'annule en x = 1 et en x = 3", true],
        ["Le minimum de f vaut −1 et il est atteint en x = 2", true],
        ["f(0) = 3", true],
        ["La parabole est tournée vers le bas", false]
      ]
    },
    {
      "statement": "Le diagramme montre le nombre de livres vendus chaque jour. Quelles affirmations sont vraies ?",
      "points": 2,
      "image": "/exemples/maths/q03-barres.svg",
      "choices": [
        ["Le jour où l'on a vendu le plus de livres est jeudi", true],
        ["En moyenne, on a vendu 6 livres par jour", true],
        ["30 livres ont été vendus en tout sur la semaine", true],
        ["La médiane des ventes est de 6 livres", false]
      ]
    },
    {
      "statement": "Une classe compte 40 élèves. D'après le diagramme, combien d'élèves viennent à vélo ?",
      "points": 1,
      "image": "/exemples/maths/q04-camembert.svg",
      "choices": [["10 élèves", true], ["25 élèves", false], ["15 élèves", false], ["4 élèves", false]]
    },
    {
      "statement": "Le triangle ABC est rectangle en A, avec AB = 4 cm et AC = 3 cm. Quelles affirmations sont vraies ?",
      "points": 2,
      "image": "/exemples/maths/q05-triangle.svg",
      "choices": [
        ["BC = 5 cm", true],
        ["L'aire du triangle ABC est 6 cm²", true],
        ["Le périmètre du triangle ABC est 12 cm", true],
        ["L'aire du triangle ABC est 12 cm²", false]
      ]
    },
    {
      "statement": "Lisez les coordonnées des points A, B et C. Quelles affirmations sont vraies ?",
      "points": 1,
      "image": "/exemples/maths/q06-points.svg",
      "choices": [["A(2 ; 3)", true], ["B(2 ; −1)", false], ["C(3 ; −2)", true], ["B(−2 ; 1)", false]]
    },
    {
      "statement": "Cf est la représentation graphique d'une fonction affine f. Quelles affirmations sont vraies ?",
      "points": 2,
      "image": "/exemples/maths/q07-decroissante.svg",
      "choices": [["f est décroissante", true], ["f(4) = 0", true], ["f(0) = −4", false], ["f(x) = x + 4", false]]
    },
    {
      "statement": "Quelle est l'aire de ce rectangle ?",
      "points": 1,
      "image": "/exemples/maths/q08-rectangle.svg",
      "choices": [["15 cm²", true], ["17 cm²", false], ["8,5 cm²", false], ["12,5 cm²", false]]
    },
    {
      "statement": "Combien vaut 3/4 + 1/8 ?",
      "points": 1,
      "image": null,
      "choices": [["7/8", true], ["0,875", true], ["4/12", false], ["1", false]]
    },
    {
      "statement": "Parmi ces nombres, lesquels sont des nombres premiers ?",
      "points": 1,
      "image": null,
      "choices": [["2", true], ["9", false], ["17", true], ["21", false]]
    }
  ]$json$::jsonb)
  loop
    insert into public.questions (quiz_id, statement, points, image_url, position)
    values (v_quiz, v_q ->> 'statement', (v_q ->> 'points')::numeric, v_q ->> 'image', v_pos)
    returning id into v_qid;
    v_pos  := v_pos + 1;
    v_cpos := 0;

    for v_c in select value from jsonb_array_elements(v_q -> 'choices') loop
      v_cpos := v_cpos + 1;
      insert into public.choices (question_id, label, is_correct, position)
      values (v_qid, v_c ->> 0, (v_c ->> 1)::boolean, v_cpos);
    end loop;
  end loop;
  -- Les triggers vérifient en fin de transaction : 4 choix et 1 à 3 bonnes réponses par question.
end
$seed$;

-- -----------------------------------------------------------------------------
-- (Facultatif) Affecter ce test à TOUS les candidats actifs et le lancer tout de suite.
-- Décommentez les deux requêtes ci-dessous si vous ne voulez pas passer par l'interface admin.
-- -----------------------------------------------------------------------------
-- insert into public.quiz_assignments (quiz_id, user_id)
-- select '6d0b5c2e-9a8f-4d1e-b7c3-1a2b3c4d5e60', id from public.profiles
--  where role = 'candidate' and is_active
-- on conflict do nothing;
--
-- update public.quizzes set is_published = true where id = '6d0b5c2e-9a8f-4d1e-b7c3-1a2b3c4d5e60';
