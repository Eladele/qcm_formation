import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuizRepository } from '../../application';
import type { Quiz, QuizDraft } from '../../domain';
import { call } from '../supabase/errors';
import { QuizMapper, type QuizRow } from '../supabase/mappers';

const SELECT = '*, questions(count)';

export class SupabaseQuizRepository implements QuizRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async list(): Promise<Quiz[]> {
    const rows = await call<QuizRow[]>(() => this.db.from('quizzes').select(SELECT).order('created_at', { ascending: false }));
    return rows.map(QuizMapper.toDomain);
  }

  async getById(id: string): Promise<Quiz | null> {
    const row = await call<QuizRow | null>(() => this.db.from('quizzes').select(SELECT).eq('id', id).maybeSingle());
    return row ? QuizMapper.toDomain(row) : null;
  }

  async create(draft: QuizDraft): Promise<Quiz> {
    const row = await call<QuizRow>(() => this.db.from('quizzes').insert(QuizMapper.toRow(draft)).select(SELECT).single());
    return QuizMapper.toDomain(row);
  }

  async update(id: string, draft: QuizDraft): Promise<Quiz> {
    const row = await call<QuizRow>(() =>
      this.db.from('quizzes').update(QuizMapper.toRow(draft)).eq('id', id).select(SELECT).single(),
    );
    return QuizMapper.toDomain(row);
  }

  async setPublished(id: string, published: boolean): Promise<void> {
    await call(() => this.db.from('quizzes').update({ is_published: published }).eq('id', id));
  }

  async delete(id: string): Promise<void> {
    await call(() => this.db.from('quizzes').delete().eq('id', id));
  }
}
