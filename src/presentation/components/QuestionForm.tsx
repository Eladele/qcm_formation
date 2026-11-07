import { useMemo, useState } from 'react';
import {
  CHOICE_LETTERS,
  QUESTION_RULES,
  QuestionDraftFactory,
  correctCount,
  questionValidator,
  type QuestionDraft,
} from '../../domain';
import { Alert } from './ui';

interface QuestionFormProps {
  initial?: QuestionDraft;
  busy?: boolean;
  serverError?: string | null;
  onSubmit: (draft: QuestionDraft) => void;
  onCancel: () => void;
}

/**
 * Formulaire « bête » : toutes les règles viennent du domaine
 * (QuestionDraftFactory pour les mutations, questionValidator pour la validation).
 */
export function QuestionForm({ initial, busy, serverError, onSubmit, onCancel }: QuestionFormProps) {
  const [draft, setDraft] = useState<QuestionDraft>(initial ?? QuestionDraftFactory.empty());
  const [submitted, setSubmitted] = useState(false);

  const issues = useMemo(() => questionValidator.validate(draft), [draft]);
  const fieldError = (field: string) => (submitted ? issues.find((i) => i.field === field)?.message : undefined);
  const nbCorrect = correctCount(draft);
  const correctOk = nbCorrect >= QUESTION_RULES.MIN_CORRECT && nbCorrect <= QUESTION_RULES.MAX_CORRECT;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (issues.length === 0) onSubmit(draft);
  };

  return (
    <form className="question-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="statement">Énoncé de la question</label>
        <textarea
          id="statement"
          rows={3}
          autoFocus
          placeholder="Ex. : Quels sont des langages typés statiquement ?"
          value={draft.statement}
          className={fieldError('statement') ? 'invalid' : ''}
          onChange={(e) => setDraft(QuestionDraftFactory.withStatement(draft, e.target.value))}
        />
        {fieldError('statement') && <p className="field-error">{fieldError('statement')}</p>}
      </div>

      <div className="field field-inline">
        <label htmlFor="points">Barème</label>
        <input
          id="points"
          type="number"
          step={0.25}
          min={QUESTION_RULES.POINTS_MIN}
          max={QUESTION_RULES.POINTS_MAX}
          value={draft.points}
          className={fieldError('points') ? 'invalid' : ''}
          onChange={(e) => setDraft(QuestionDraftFactory.withPoints(draft, Number(e.target.value)))}
        />
        <span className="muted">point(s)</span>
      </div>
      {fieldError('points') && <p className="field-error">{fieldError('points')}</p>}

      <div className="choices-header">
        <span>Choix de réponse</span>
        <span className={`correct-counter ${correctOk ? 'ok' : 'ko'}`}>
          {nbCorrect} / {QUESTION_RULES.MAX_CORRECT} bonnes réponses max.
        </span>
      </div>

      <ul className="choice-editor">
        {draft.choices.map((choice, i) => {
          const canToggle = QuestionDraftFactory.canToggleCorrect(draft, i);
          const err = fieldError(`choices.${i}`);
          return (
            <li key={i} className={`choice-row ${choice.isCorrect ? 'is-correct' : 'is-wrong'}`}>
              <span className="choice-letter">{CHOICE_LETTERS[i]}</span>
              <input
                type="text"
                aria-label={`Libellé du choix ${CHOICE_LETTERS[i]}`}
                placeholder={`Réponse ${CHOICE_LETTERS[i]}`}
                value={choice.label}
                className={err ? 'invalid' : ''}
                onChange={(e) => setDraft(QuestionDraftFactory.withChoiceLabel(draft, i, e.target.value))}
              />
              <button
                type="button"
                role="switch"
                aria-checked={choice.isCorrect}
                className={`truth-toggle ${choice.isCorrect ? 'true' : 'false'}`}
                disabled={!canToggle}
                title={canToggle ? 'Basculer vrai / faux' : 'Maximum 3 bonnes réponses : au moins un choix doit être faux'}
                onClick={() => setDraft(QuestionDraftFactory.toggleCorrect(draft, i))}
              >
                {choice.isCorrect ? '✓ Vrai' : '✕ Faux'}
              </button>
              {err && <p className="field-error choice-error">{err}</p>}
            </li>
          );
        })}
      </ul>

      {submitted &&
        issues
          .filter((i) => i.field === 'correct' || i.field === 'choices')
          .map((i) => <p key={i.code} className="field-error">{i.message}</p>)}
      {serverError && <Alert>{serverError}</Alert>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer la question'}
        </button>
      </div>
    </form>
  );
}
