import { useMemo, useState } from 'react';
import { QUIZ_RULES, ScoringStrategyFactory, quizValidator, type QuizDraft, type ScoringMode } from '../../domain';
import { DurationInput } from './DurationInput';
import { Alert } from './ui';

interface Props {
  initial: QuizDraft;
  submitLabel: string;
  busy?: boolean;
  serverError?: string | null;
  onSubmit: (draft: QuizDraft) => void;
}

export function QuizSettingsForm({ initial, submitLabel, busy, serverError, onSubmit }: Props) {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const issues = useMemo(() => quizValidator.validate(draft), [draft]);
  const err = (field: keyof QuizDraft) => (submitted ? issues.find((i) => i.field === field)?.message : undefined);
  const set = <K extends keyof QuizDraft>(key: K, value: QuizDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const strategies = ScoringStrategyFactory.all();
  const current = strategies.find((s) => s.mode === draft.scoringMode);

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (issues.length === 0) onSubmit(draft);
      }}
    >
      <div className="field">
        <label htmlFor="title">Titre du test</label>
        <input id="title" value={draft.title} maxLength={QUIZ_RULES.TITLE_MAX} className={err('title') ? 'invalid' : ''}
          onChange={(e) => set('title', e.target.value)} placeholder="Ex. : TypeScript — niveau 1" />
        {err('title') && <p className="field-error">{err('title')}</p>}
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)}
          placeholder="Consignes affichées au candidat avant de commencer" />
      </div>

      <div className="grid-2">
        <div className="field">
          <label>Durée totale du test</label>
          <DurationInput value={draft.durationSeconds} invalid={!!err('durationSeconds')} onChange={(s) => set('durationSeconds', s)} />
          {err('durationSeconds') && <p className="field-error">{err('durationSeconds')}</p>}
        </div>

        <div className="field">
          <label htmlFor="questionDurationSeconds">Temps par question (optionnel)</label>
          <input
            id="questionDurationSeconds"
            type="number"
            min={10}
            max={3600}
            placeholder="Ex : 60 (1 min) ou 120 (2 min)"
            value={draft.questionDurationSeconds ?? ''}
            onChange={(e) => set('questionDurationSeconds', e.target.value ? Number(e.target.value) : null)}
          />
          <span className="hint">Chronomètre qui passe automatiquement à la question suivante</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="scoring">Notation</label>
          <select id="scoring" value={draft.scoringMode} onChange={(e) => set('scoringMode', e.target.value as ScoringMode)}>
            {strategies.map((s) => <option key={s.mode} value={s.mode}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="attempts">Tentatives max.</label>
          <input id="attempts" type="number" min={QUIZ_RULES.MAX_ATTEMPTS_MIN} max={QUIZ_RULES.MAX_ATTEMPTS_MAX}
            value={draft.maxAttempts} className={err('maxAttempts') ? 'invalid' : ''}
            onChange={(e) => set('maxAttempts', Math.floor(Number(e.target.value)))} />
        </div>
      </div>
      {current && <p className="hint">{current.description}</p>}
      {err('maxAttempts') && <p className="field-error">{err('maxAttempts')}</p>}

      <label className="checkbox">
        <input type="checkbox" checked={draft.shuffle} onChange={(e) => set('shuffle', e.target.checked)} />
        Mélanger l'ordre des questions et des choix pour chaque candidat
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={draft.showCorrection} onChange={(e) => set('showCorrection', e.target.checked)} />
        Afficher la correction au candidat après le test
      </label>

      {serverError && <Alert>{serverError}</Alert>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : submitLabel}</button>
      </div>
    </form>
  );
}
