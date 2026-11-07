import { DomainError, ErrorCodes } from '../shared/DomainError';
import { Validator, rule } from '../shared/Validation';

export type ScoringMode = 'all_or_nothing' | 'partial';

export interface Quiz {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly questionDurationSeconds?: number | null;
  readonly scoringMode: ScoringMode;
  readonly maxAttempts: number;
  readonly showCorrection: boolean;
  readonly shuffle: boolean;
  readonly isPublished: boolean;
  readonly questionCount: number;
  readonly createdAt: string;
}

export type QuizDraft = Pick<
  Quiz,
  'title' | 'description' | 'durationSeconds' | 'scoringMode' | 'maxAttempts' | 'showCorrection' | 'shuffle'
> & {
  readonly questionDurationSeconds?: number | null;
};

export const QUIZ_RULES = {
  TITLE_MIN: 3,
  TITLE_MAX: 200,
  DURATION_MIN_SECONDS: 60,
  DURATION_MAX_SECONDS: 24 * 3600,
  MAX_ATTEMPTS_MIN: 1,
  MAX_ATTEMPTS_MAX: 20,
} as const;

export const QuizDraftFactory = {
  empty(): QuizDraft {
    return {
      title: '',
      description: '',
      durationSeconds: 30 * 60,
      questionDurationSeconds: null,
      scoringMode: 'all_or_nothing',
      maxAttempts: 1,
      showCorrection: true,
      shuffle: true,
    };
  },
  fromQuiz(q: Quiz): QuizDraft {
    const { title, description, durationSeconds, questionDurationSeconds, scoringMode, maxAttempts, showCorrection, shuffle } = q;
    return { title, description, durationSeconds, questionDurationSeconds: questionDurationSeconds ?? null, scoringMode, maxAttempts, showCorrection, shuffle };
  },
  normalize(d: QuizDraft): QuizDraft {
    return {
      ...d,
      title: d.title.trim(),
      description: d.description.trim(),
      durationSeconds: Math.round(d.durationSeconds),
      questionDurationSeconds: d.questionDurationSeconds ? Math.round(d.questionDurationSeconds) : null,
    };
  },
};

export const quizValidator = new Validator<QuizDraft>([
  rule(
    ErrorCodes.QUIZ_TITLE_INVALID,
    `Le titre doit contenir entre ${QUIZ_RULES.TITLE_MIN} et ${QUIZ_RULES.TITLE_MAX} caractères.`,
    (d) => d.title.trim().length >= QUIZ_RULES.TITLE_MIN && d.title.trim().length <= QUIZ_RULES.TITLE_MAX,
    'title',
  ),
  rule(
    ErrorCodes.QUIZ_DURATION_INVALID,
    'La durée doit être comprise entre 1 minute et 24 heures.',
    (d) =>
      Number.isInteger(d.durationSeconds) &&
      d.durationSeconds >= QUIZ_RULES.DURATION_MIN_SECONDS &&
      d.durationSeconds <= QUIZ_RULES.DURATION_MAX_SECONDS,
    'durationSeconds',
  ),
  rule(
    ErrorCodes.QUIZ_MAX_ATTEMPTS_INVALID,
    `Le nombre de tentatives doit être compris entre ${QUIZ_RULES.MAX_ATTEMPTS_MIN} et ${QUIZ_RULES.MAX_ATTEMPTS_MAX}.`,
    (d) =>
      Number.isInteger(d.maxAttempts) &&
      d.maxAttempts >= QUIZ_RULES.MAX_ATTEMPTS_MIN &&
      d.maxAttempts <= QUIZ_RULES.MAX_ATTEMPTS_MAX,
    'maxAttempts',
  ),
]);

/** Politique de publication / modification du contenu d'un test. */
export const QuizPublicationPolicy = {
  /** « Lancer » un test : il faut des questions ET au moins un candidat affecté. */
  assertCanLaunch(questionCount: number, assignedCount: number): void {
    if (questionCount < 1) throw new DomainError(ErrorCodes.QUIZ_EMPTY);
    if (assignedCount < 1) throw new DomainError(ErrorCodes.QUIZ_NO_CANDIDATES);
  },
  assertCanDeleteQuestion(quiz: Pick<Quiz, 'isPublished'>, questionCount: number): void {
    if (quiz.isPublished && questionCount <= 1) throw new DomainError(ErrorCodes.LAST_QUESTION_OF_PUBLISHED_QUIZ);
  },
};
