import { QUESTION_RULES } from '../quiz/Question';
import type { ScoringMode } from '../quiz/Quiz';
import { DomainError, ErrorCodes } from '../shared/DomainError';

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired';

/** Une question telle que vue par le candidat : AUCUNE information sur la correction. */
export interface SessionQuestion {
  readonly id: string;
  readonly statement: string;
  readonly points: number;
  readonly choices: readonly { readonly id: string; readonly label: string }[];
}

export interface AttemptSessionData {
  readonly attemptId: string;
  readonly quizId: string;
  readonly quizTitle: string;
  readonly status: AttemptStatus;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly durationSeconds: number;
  readonly questions: readonly SessionQuestion[];
  readonly selected: Readonly<Record<string, readonly string[]>>;
  /** Décalage horloge serveur − horloge locale (ms), mesuré par l'infrastructure. */
  readonly clockOffsetMs: number;
}

/** Nombre maximum de cases cochables : il y a toujours au moins une réponse fausse. */
export const MAX_SELECTIONS_PER_QUESTION = QUESTION_RULES.MAX_CORRECT;

/**
 * Feuille de réponses immuable du candidat.
 * Chaque modification renvoie une nouvelle instance (compatible avec useReducer).
 */
export class AnswerSheet {
  private readonly answers: ReadonlyMap<string, ReadonlySet<string>>;

  private constructor(answers: ReadonlyMap<string, ReadonlySet<string>>) {
    this.answers = answers;
  }

  static empty(): AnswerSheet {
    return new AnswerSheet(new Map());
  }

  static from(record: Readonly<Record<string, readonly string[]>>): AnswerSheet {
    const map = new Map<string, ReadonlySet<string>>();
    for (const [questionId, ids] of Object.entries(record)) {
      if (ids.length > 0) map.set(questionId, new Set(ids));
    }
    return new AnswerSheet(map);
  }

  selected(questionId: string): ReadonlySet<string> {
    return this.answers.get(questionId) ?? new Set();
  }

  isSelected(questionId: string, choiceId: string): boolean {
    return this.selected(questionId).has(choiceId);
  }

  isAnswered(questionId: string): boolean {
    return this.selected(questionId).size > 0;
  }

  get answeredCount(): number {
    return this.answers.size;
  }

  canSelectMore(questionId: string): boolean {
    return this.selected(questionId).size < MAX_SELECTIONS_PER_QUESTION;
  }

  toggle(questionId: string, choiceId: string): AnswerSheet {
    const current = new Set(this.selected(questionId));
    if (current.has(choiceId)) {
      current.delete(choiceId);
    } else {
      if (current.size >= MAX_SELECTIONS_PER_QUESTION) throw new DomainError(ErrorCodes.TOO_MANY_CHOICES);
      current.add(choiceId);
    }
    const next = new Map(this.answers);
    if (current.size === 0) next.delete(questionId);
    else next.set(questionId, current);
    return new AnswerSheet(next);
  }

  toArray(questionId: string): string[] {
    return [...this.selected(questionId)];
  }
}

export interface AttemptSummary {
  readonly attemptId: string;
  readonly status: AttemptStatus;
  readonly score: number;
  readonly maxScore: number;
  readonly submittedAt: string | null;
}

export interface ResultChoice {
  readonly id: string;
  readonly label: string;
  readonly isCorrect: boolean;
  readonly selected: boolean;
}

export interface ResultQuestion {
  readonly id: string;
  readonly statement: string;
  readonly points: number;
  readonly choices: readonly ResultChoice[];
}

export interface AttemptResult {
  readonly attemptId: string;
  readonly quizId: string;
  readonly quizTitle: string;
  readonly scoringMode: ScoringMode;
  readonly status: AttemptStatus;
  readonly score: number;
  readonly maxScore: number;
  readonly startedAt: string;
  readonly submittedAt: string | null;
  readonly showCorrection: boolean;
  readonly questions: readonly ResultQuestion[];
}

/** Ligne affichée dans le tableau de résultats de l'administrateur. */
export interface AttemptRecord {
  readonly id: string;
  readonly candidateName: string;
  readonly status: AttemptStatus;
  readonly score: number | null;
  readonly maxScore: number | null;
  readonly startedAt: string;
  readonly submittedAt: string | null;
}

/** Test visible dans le catalogue du candidat, avec son état personnel. */
export interface AvailableQuiz {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly questionCount: number;
  readonly maxAttempts: number;
  readonly attemptsUsed: number;
  readonly inProgressAttemptId: string | null;
  readonly lastAttemptId: string | null;
  readonly bestScore: number | null;
  readonly maxScore: number;
}

export type QuizAvailability = 'resume' | 'start' | 'exhausted';

export function availabilityOf(q: AvailableQuiz): QuizAvailability {
  if (q.inProgressAttemptId) return 'resume';
  return q.attemptsUsed < q.maxAttempts ? 'start' : 'exhausted';
}
