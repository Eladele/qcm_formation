import type { SupabaseClient } from '@supabase/supabase-js';
import type { AttemptGateway } from '../../application';
import { ServerSyncedClock, systemClock, type AttemptRecord, type AttemptResult, type AttemptSessionData, type AttemptSummary, type AvailableQuiz } from '../../domain';
import { call } from '../supabase/errors';
import { AttemptMapper, type AttemptRow, type AvailableQuizRow } from '../supabase/mappers';

type SessionJson = Parameters<typeof AttemptMapper.session>[0];
type SummaryJson = Parameters<typeof AttemptMapper.summary>[0];
type ResultJson = Parameters<typeof AttemptMapper.result>[0];

export class SupabaseAttemptGateway implements AttemptGateway {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async listAvailable(): Promise<AvailableQuiz[]> {
    const rows = await call<AvailableQuizRow[]>(() => this.db.rpc('list_available_quizzes'));
    return rows.map(AttemptMapper.available);
  }

  start(quizId: string): Promise<string> {
    return call<string>(() => this.db.rpc('start_attempt', { p_quiz_id: quizId }));
  }

  async loadSession(attemptId: string): Promise<AttemptSessionData> {
    const sentAt = systemClock.now();
    const json = await call<SessionJson>(() => this.db.rpc('get_attempt_session', { p_attempt_id: attemptId }));
    const receivedAt = systemClock.now();
    const offset = ServerSyncedClock.fromRoundTrip(Date.parse(json.serverNow), sentAt, receivedAt).offset;
    return AttemptMapper.session(json, offset);
  }

  async saveAnswer(attemptId: string, questionId: string, choiceIds: readonly string[]): Promise<void> {
    await call(() =>
      this.db.rpc('save_answer', { p_attempt_id: attemptId, p_question_id: questionId, p_choice_ids: [...choiceIds] }),
    );
  }

  async submit(attemptId: string): Promise<AttemptSummary> {
    const json = await call<SummaryJson>(() => this.db.rpc('submit_attempt', { p_attempt_id: attemptId }));
    return AttemptMapper.summary(json);
  }

  async getResult(attemptId: string): Promise<AttemptResult> {
    const json = await call<ResultJson>(() => this.db.rpc('get_attempt_result', { p_attempt_id: attemptId }));
    return AttemptMapper.result(json);
  }

  async listByQuiz(quizId: string): Promise<AttemptRecord[]> {
    const rows = await call<AttemptRow[]>(() =>
      this.db
        .from('attempts')
        .select('id, status, score, max_score, started_at, submitted_at, profiles(full_name)')
        .eq('quiz_id', quizId)
        .order('started_at', { ascending: false }),
    );
    return rows.map(AttemptMapper.record);
  }
}
