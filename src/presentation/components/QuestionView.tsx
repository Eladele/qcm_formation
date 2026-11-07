import { CHOICE_LETTERS, MAX_SELECTIONS_PER_QUESTION, type AnswerSheet, type SessionQuestion } from '../../domain';
import { formatPoints } from './ui';

interface Props {
  question: SessionQuestion;
  index: number;
  total: number;
  answers: AnswerSheet;
  disabled: boolean;
  onToggle: (questionId: string, choiceId: string) => void;
}

/** Affiche une question au candidat — cases à cocher, jamais d'indice sur la correction. */
export function QuestionView({ question, index, total, answers, disabled, onToggle }: Props) {
  const selectedCount = answers.selected(question.id).size;
  const limitReached = !answers.canSelectMore(question.id);

  return (
    <article className="card question-card">
      <header className="question-head">
        <span className="question-index">Question {index + 1} / {total}</span>
        <span className="badge badge-neutral">{formatPoints(question.points)} pt</span>
      </header>
      <h2 className="question-statement">{question.statement}</h2>
      {question.imageUrl && (
        <div className="question-image-wrap">
          <img src={question.imageUrl} alt="Illustration de la question" className="question-image" />
        </div>
      )}
      <p className="hint">
        Cochez entre 1 et {MAX_SELECTIONS_PER_QUESTION} réponses — au moins une proposition est fausse.
        <span className="selection-count"> {selectedCount} sélectionnée(s)</span>
      </p>

      <ul className="answer-list">
        {question.choices.map((choice, i) => {
          const checked = answers.isSelected(question.id, choice.id);
          const blocked = disabled || (!checked && limitReached);
          return (
            <li key={choice.id}>
              <label className={`answer ${checked ? 'checked' : ''} ${blocked && !checked ? 'blocked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={blocked}
                  onChange={() => onToggle(question.id, choice.id)}
                />
                <span className="answer-letter">{CHOICE_LETTERS[i]}</span>
                <span className="answer-label">{choice.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
