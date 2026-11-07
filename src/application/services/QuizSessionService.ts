import {
  AnswerSheet,
  ScoringStrategyFactory,
  ServerSyncedClock,
  scoreAnswers,
  type AttemptResult,
  type AttemptSessionData,
  type AttemptSummary,
  type AvailableQuiz,
  type Clock,
  type ScoreBreakdown,
} from '../../domain';
import type { AttemptGateway } from '../ports';
import { AnswerSyncQueue } from './AnswerSyncQueue';

export interface OpenedSession {
  readonly data: AttemptSessionData;
  readonly answers: AnswerSheet;
  readonly clock: Clock;
  readonly deadlineMs: number;
  readonly queue: AnswerSyncQueue;
}

export interface ResultView {
  readonly result: AttemptResult;
  /** Détail par question, null si la correction n'est pas visible. */
  readonly breakdown: ScoreBreakdown | null;
  readonly percentage: number;
}

/** Cas d'utilisation du candidat : démarrer, répondre, soumettre, consulter. */
export class QuizSessionService {
  private readonly gateway: AttemptGateway;

  constructor(gateway: AttemptGateway) {
    this.gateway = gateway;
  }

  listAvailable(): Promise<AvailableQuiz[]> {
    return this.gateway.listAvailable();
  }

  /** Démarre une nouvelle tentative ou renvoie celle en cours (reprise après rechargement). */
  start(quizId: string): Promise<string> {
    return this.gateway.start(quizId);
  }

  async open(attemptId: string): Promise<OpenedSession> {
    const data = await this.gateway.loadSession(attemptId);
    return {
      data,
      answers: AnswerSheet.from(data.selected),
      clock: new ServerSyncedClock(data.clockOffsetMs),
      deadlineMs: Date.parse(data.expiresAt),
      queue: new AnswerSyncQueue((questionId, choiceIds) => this.gateway.saveAnswer(attemptId, questionId, choiceIds)),
    };
  }

  /**
   * Soumission : on vide d'abord la file d'auto-save. Si une sauvegarde échoue
   * (ex. temps écoulé), on soumet malgré tout — le serveur note les réponses déjà enregistrées.
   */
  async submit(attemptId: string, queue: AnswerSyncQueue): Promise<{ summary: AttemptSummary; unsynced: boolean }> {
    let unsynced = false;
    try {
      await queue.flush();
    } catch {
      unsynced = true;
    }
    const summary = await this.gateway.submit(attemptId);
    return { summary, unsynced };
  }

  async getResult(attemptId: string): Promise<ResultView> {
    const result = await this.gateway.getResult(attemptId);
    const percentage = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
    if (!result.showCorrection || result.questions.length === 0) return { result, breakdown: null, percentage };

    const strategy = ScoringStrategyFactory.for(result.scoringMode);
    const breakdown = scoreAnswers(
      strategy,
      result.questions.map((q) => ({
        points: q.points,
        correctChoiceIds: new Set(q.choices.filter((c) => c.isCorrect).map((c) => c.id)),
        selectedChoiceIds: new Set(q.choices.filter((c) => c.selected).map((c) => c.id)),
      })),
    );
    return { result, breakdown, percentage };
  }

  listAttempts(quizId: string) {
    return this.gateway.listByQuiz(quizId);
  }
}
