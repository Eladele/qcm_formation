import type { SupabaseClient } from '@supabase/supabase-js';
import { toDomainError } from './errors';

/**
 * Appelle une Edge Function et convertit son erreur `{ error: "CODE" }` en DomainError.
 * (supabase-js renvoie la Response brute dans error.context pour les statuts ≠ 2xx.)
 */
export async function invokeFunction<T>(db: SupabaseClient, name: string, body: Record<string, unknown>): Promise<T> {
  try {
    const { data, error } = await db.functions.invoke<T>(name, { body });
    if (error) {
      const response = (error as { context?: Response }).context;
      const payload = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
      throw toDomainError(new Error(payload?.error ?? error.message));
    }
    return data as T;
  } catch (e) {
    throw toDomainError(e);
  }
}
