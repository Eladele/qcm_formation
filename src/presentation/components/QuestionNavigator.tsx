import type { AnswerSheet, SessionQuestion } from '../../domain';

interface Props {
  questions: readonly SessionQuestion[];
  answers: AnswerSheet;
  current: number;
  onSelect: (index: number) => void;
  disableNavigation?: boolean;
}

export function QuestionNavigator({ questions, answers, current, onSelect, disableNavigation }: Props) {
  return (
    <nav className="navigator" aria-label="Navigation entre les questions">
      {questions.map((q, i) => (
        <button
          key={q.id}
          disabled={disableNavigation && i !== current}
          className={`nav-cell ${i === current ? 'current' : ''} ${answers.isAnswered(q.id) ? 'answered' : ''}`}
          onClick={() => onSelect(i)}
          aria-current={i === current ? 'step' : undefined}
          aria-label={`Question ${i + 1}${answers.isAnswered(q.id) ? ', répondue' : ''}`}
        >
          {i + 1}
        </button>
      ))}
    </nav>
  );
}
