import { ErrorCodes } from '../shared/DomainError';
import { Validator, eachRule, rule } from '../shared/Validation';

/** Invariants métier d'une question QCM. */
export const QUESTION_RULES = {
  CHOICES_COUNT: 4,
  MIN_CORRECT: 1,
  MAX_CORRECT: 3,
  STATEMENT_MAX: 2000,
  LABEL_MAX: 500,
  POINTS_MIN: 0.25,
  POINTS_MAX: 100,
} as const;

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface Choice {
  readonly id: string;
  readonly label: string;
  readonly isCorrect: boolean;
  readonly position: number;
}

export interface Question {
  readonly id: string;
  readonly quizId: string;
  readonly statement: string;
  readonly points: number;
  readonly position: number;
  readonly choices: readonly Choice[];
}

/** Brouillon manipulé par le formulaire d'administration. */
export interface ChoiceDraft {
  readonly label: string;
  readonly isCorrect: boolean;
}

export interface QuestionDraft {
  readonly statement: string;
  readonly points: number;
  readonly choices: readonly ChoiceDraft[];
}

export const correctCount = (draft: QuestionDraft): number => draft.choices.filter((c) => c.isCorrect).length;

/**
 * Factory + opérations immuables sur le brouillon.
 * Toutes les mutations passent par ici : le formulaire ne connaît pas les règles.
 */
export const QuestionDraftFactory = {
  empty(): QuestionDraft {
    return {
      statement: '',
      points: 1,
      choices: Array.from({ length: QUESTION_RULES.CHOICES_COUNT }, () => ({ label: '', isCorrect: false })),
    };
  },

  fromQuestion(question: Question): QuestionDraft {
    return {
      statement: question.statement,
      points: question.points,
      choices: [...question.choices]
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
    };
  },

  normalize(draft: QuestionDraft): QuestionDraft {
    return {
      statement: draft.statement.trim(),
      points: Math.round(draft.points * 100) / 100,
      choices: draft.choices.map((c) => ({ label: c.label.trim(), isCorrect: c.isCorrect })),
    };
  },

  withStatement(draft: QuestionDraft, statement: string): QuestionDraft {
    return { ...draft, statement };
  },

  withPoints(draft: QuestionDraft, points: number): QuestionDraft {
    return { ...draft, points };
  },

  withChoiceLabel(draft: QuestionDraft, index: number, label: string): QuestionDraft {
    return { ...draft, choices: draft.choices.map((c, i) => (i === index ? { ...c, label } : c)) };
  },

  /**
   * Bascule un choix vrai/faux. Refuse silencieusement de dépasser MAX_CORRECT :
   * l'invariant « au moins un choix faux » ne peut pas être violé depuis l'UI.
   */
  toggleCorrect(draft: QuestionDraft, index: number): QuestionDraft {
    if (!QuestionDraftFactory.canToggleCorrect(draft, index)) return draft;
    return { ...draft, choices: draft.choices.map((c, i) => (i === index ? { ...c, isCorrect: !c.isCorrect } : c)) };
  },

  canToggleCorrect(draft: QuestionDraft, index: number): boolean {
    const choice = draft.choices[index];
    if (!choice) return false;
    return choice.isCorrect || correctCount(draft) < QUESTION_RULES.MAX_CORRECT;
  },
};

const norm = (s: string) => s.trim().toLocaleLowerCase('fr');

export const questionValidator = new Validator<QuestionDraft>([
  rule(ErrorCodes.QUESTION_STATEMENT_EMPTY, "L'énoncé est obligatoire.", (d) => d.statement.trim().length > 0, 'statement'),
  rule(
    ErrorCodes.QUESTION_STATEMENT_TOO_LONG,
    `L'énoncé ne doit pas dépasser ${QUESTION_RULES.STATEMENT_MAX} caractères.`,
    (d) => d.statement.trim().length <= QUESTION_RULES.STATEMENT_MAX,
    'statement',
  ),
  rule(
    ErrorCodes.QUESTION_POINTS_OUT_OF_RANGE,
    `Le barème doit être compris entre ${QUESTION_RULES.POINTS_MIN} et ${QUESTION_RULES.POINTS_MAX} points.`,
    (d) => Number.isFinite(d.points) && d.points >= QUESTION_RULES.POINTS_MIN && d.points <= QUESTION_RULES.POINTS_MAX,
    'points',
  ),
  rule(
    ErrorCodes.QUESTION_MUST_HAVE_4_CHOICES,
    `Une question doit comporter exactement ${QUESTION_RULES.CHOICES_COUNT} choix.`,
    (d) => d.choices.length === QUESTION_RULES.CHOICES_COUNT,
    'choices',
  ),
  eachRule(
    (d: QuestionDraft) => d.choices,
    ErrorCodes.QUESTION_CHOICE_EMPTY,
    (i) => `Le choix ${CHOICE_LETTERS[i] ?? i + 1} est vide.`,
    (c) => c.label.trim().length > 0,
    'choices',
  ),
  eachRule(
    (d: QuestionDraft) => d.choices,
    ErrorCodes.QUESTION_CHOICE_TOO_LONG,
    (i) => `Le choix ${CHOICE_LETTERS[i] ?? i + 1} dépasse ${QUESTION_RULES.LABEL_MAX} caractères.`,
    (c) => c.label.trim().length <= QUESTION_RULES.LABEL_MAX,
    'choices',
  ),
  rule(
    ErrorCodes.QUESTION_CHOICES_DUPLICATED,
    'Deux choix ne peuvent pas avoir le même libellé.',
    (d) => {
      const labels = d.choices.map((c) => norm(c.label)).filter((l) => l.length > 0);
      return new Set(labels).size === labels.length;
    },
    'choices',
  ),
  rule(
    ErrorCodes.QUESTION_CORRECT_COUNT_1_TO_3,
    `Il faut entre ${QUESTION_RULES.MIN_CORRECT} et ${QUESTION_RULES.MAX_CORRECT} bonnes réponses (au moins une réponse fausse).`,
    (d) => {
      const n = correctCount(d);
      return n >= QUESTION_RULES.MIN_CORRECT && n <= QUESTION_RULES.MAX_CORRECT;
    },
    'correct',
  ),
]);
