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
        .select('id, quiz_id, statement, points, position, image_url, duration_seconds, choices(id, label, is_correct, position)')
        .eq('quiz_id', quizId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
    );
    return rows.map(QuestionMapper.toDomain);
  }

  /** Téléverse une image dans le bucket question-images et renvoie son URL publique. */
  async uploadImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error } = await this.db.storage.from('question-images').upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    const { data } = this.db.storage.from('question-images').getPublicUrl(fileName);
    return data.publicUrl;
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
        p_image_url: draft.imageUrl ?? null,
        p_duration_seconds: draft.durationSeconds ?? null,
      }),
    );
  }

  async delete(questionId: string): Promise<void> {
    await call(() => this.db.from('questions').delete().eq('id', questionId));
  }
}
