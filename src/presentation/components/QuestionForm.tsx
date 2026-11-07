import { useMemo, useRef, useState } from 'react';
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
  onUploadImage?: (file: File) => Promise<string>;
  onSubmit: (draft: QuestionDraft) => void;
  onCancel: () => void;
}

/**
 * Formulaire de question avec téléversement d'image et chronomètre individuel.
 */
export function QuestionForm({ initial, busy, serverError, onUploadImage, onSubmit, onCancel }: QuestionFormProps) {
  const [draft, setDraft] = useState<QuestionDraft>(initial ?? QuestionDraftFactory.empty());
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const issues = useMemo(() => questionValidator.validate(draft), [draft]);
  const fieldError = (field: string) => (submitted ? issues.find((i) => i.field === field)?.message : undefined);
  const nbCorrect = correctCount(draft);
  const correctOk = nbCorrect >= QUESTION_RULES.MIN_CORRECT && nbCorrect <= QUESTION_RULES.MAX_CORRECT;

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadImage) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await onUploadImage(file);
      setDraft(QuestionDraftFactory.withImageUrl(draft, url));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erreur lors du téléversement');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setDraft(QuestionDraftFactory.withImageUrl(draft, null));
  };

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

      {/* Image associée à la question */}
      <div className="field">
        <label>Image d'illustration (optionnelle)</label>
        {draft.imageUrl ? (
          <div className="question-image-preview-card">
            <img src={draft.imageUrl} alt="Illustration de la question" className="question-image-preview" />
            <button
              type="button"
              className="btn btn-ghost btn-sm danger-text"
              onClick={handleRemoveImage}
              disabled={busy || uploading}
            >
              Supprimer l'image
            </button>
          </div>
        ) : (
          <div className="file-upload-zone">
            <input
              ref={fileInputRef}
              id="question-image-file"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageChange}
              disabled={busy || uploading || !onUploadImage}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || uploading || !onUploadImage}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Téléversement en cours…' : '📷 Choisir une image (PNG, JPG, WebP…)'}
            </button>
            <span className="muted small" style={{ marginLeft: 8 }}>
              {uploading ? 'Envoi vers Supabase Storage…' : 'Max. 5 Mo'}
            </span>
          </div>
        )}
        {uploadError && <Alert kind="warning">{uploadError}</Alert>}
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="points">Barème</label>
          <div className="row">
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
        </div>

        <div className="field">
          <label htmlFor="durationSeconds">Chronomètre par question (secondes)</label>
          <input
            id="durationSeconds"
            type="number"
            min={10}
            max={3600}
            placeholder="Ex : 60 (1 min) ou 120 (2 min)"
            value={draft.durationSeconds ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              setDraft(QuestionDraftFactory.withDurationSeconds(draft, val));
            }}
          />
          <span className="hint">Passera automatiquement à la suite une fois le temps écoulé</span>
        </div>
      </div>

      <div className="choices-header">
        <div>
          <strong>Choix de réponse</strong>
          <p className="hint" style={{ margin: 0 }}>
            Indiquez pour chaque proposition si elle est correcte (à cocher par le candidat) ou fausse.
          </p>
        </div>
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
                title={
                  canToggle
                    ? choice.isCorrect
                      ? 'Marqué comme bonne réponse — cliquer pour passer en faux'
                      : 'Marqué comme faux — cliquer pour passer en bonne réponse'
                    : 'Maximum 3 bonnes réponses : au moins un choix doit être faux'
                }
                onClick={() => setDraft(QuestionDraftFactory.toggleCorrect(draft, i))}
              >
                {choice.isCorrect ? '✓ Bonne réponse' : '✕ Fausse'}
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
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy || uploading}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={busy || uploading}>
          {busy ? 'Enregistrement…' : 'Enregistrer la question'}
        </button>
      </div>
    </form>
  );
}
