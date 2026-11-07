import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssignmentRepository, CandidateRepository } from '../../application';
import type { Candidate, CandidateDraft } from '../../domain';
import { call } from '../supabase/errors';
import { invokeFunction } from '../supabase/functions';

interface CandidateRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  has_active_qr: boolean;
  last_login_at: string | null;
}

const toCandidate = (r: CandidateRow): Candidate => ({
  id: r.id,
  fullName: r.full_name,
  phone: r.phone,
  isActive: r.is_active,
  createdAt: r.created_at,
  hasActiveQr: r.has_active_qr,
  lastLoginAt: r.last_login_at,
});

/** Lecture via RPC ; écritures via l'Edge Function (création de comptes = service_role). */
export class SupabaseCandidateRepository implements CandidateRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async list(): Promise<Candidate[]> {
    const rows = await call<CandidateRow[]>(() => this.db.rpc('list_candidates'));
    return rows.map(toCandidate);
  }

  create(draft: CandidateDraft) {
    return invokeFunction<{ candidateId: string; loginToken: string }>(this.db, 'admin-candidates', {
      action: 'create',
      fullName: draft.fullName,
      phone: draft.phone || null,
    });
  }

  async regenerateToken(candidateId: string): Promise<string> {
    const r = await invokeFunction<{ loginToken: string }>(this.db, 'admin-candidates', { action: 'regenerate', candidateId });
    return r.loginToken;
  }

  async setActive(candidateId: string, active: boolean): Promise<void> {
    await invokeFunction(this.db, 'admin-candidates', { action: 'set-active', candidateId, active });
  }

  async delete(candidateId: string): Promise<void> {
    await invokeFunction(this.db, 'admin-candidates', { action: 'delete', candidateId });
  }
}

export class SupabaseAssignmentRepository implements AssignmentRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async listCandidateIds(quizId: string): Promise<string[]> {
    const rows = await call<{ user_id: string }[]>(() => this.db.from('quiz_assignments').select('user_id').eq('quiz_id', quizId));
    return rows.map((r) => r.user_id);
  }

  async replace(quizId: string, candidateIds: readonly string[]): Promise<void> {
    await call(() => this.db.rpc('set_quiz_assignments', { p_quiz_id: quizId, p_user_ids: [...candidateIds] }));
  }
}
