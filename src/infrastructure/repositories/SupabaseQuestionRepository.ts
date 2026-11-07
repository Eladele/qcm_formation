import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuestionRepository } from '../../application';
import type { Question, QuestionDraft } from '../../domain';
import { call } from '../supabase/errors';
import { QuestionMapper, type QuestionRow } from '../supabase/mappers';

export class SupabaseQuestionRepository implements QuestionRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async listByQuiz(quizId: string): Promise<Question[]> {
    const rows = await call<QuestionRow[]>(() =>
      this.db
        .from('questions')
        .select('id, quiz_id, statement, points, position, choices(id, label, is_correct, position)')
        .eq('quiz_id', quizId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
    );
    return rows.map(QuestionMapper.toDomain);
  }

  /** Passe par la RPC transactionnelle save_question (question + 4 choix en une fois). */
  save(quizId: string, draft: QuestionDraft, questionId?: string): Promise<string> {
    return call<string>(() =>
      this.db.rpc('save_question', {
        p_quiz_id: quizId,
        p_question_id: questionId ?? null,
        p_statement: draft.statement,
        p_points: draft.points,
        p_choices: draft.choices.map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
      }),
    );
  }

  async delete(questionId: string): Promise<void> {
    await call(() => this.db.from('questions').delete().eq('id', questionId));
  }
}
