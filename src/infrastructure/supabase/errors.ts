import { DomainError, ErrorCodes, type ErrorCode } from '../../domain';

interface SupabaseLikeError {
  message?: string;
  code?: string;
}

const KNOWN = (Object.values(ErrorCodes) as ErrorCode[]).sort((a, b) => b.length - a.length);

/**
 * Anti-corruption layer : convertit les erreurs Postgres / Supabase
 * (ex. `raise exception 'QUIZ_EMPTY'`) en DomainError typées.
 */
export function toDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const e = (error ?? {}) as SupabaseLikeError;
  const message = e.message ?? String(error);

  const code = KNOWN.find((c) => message.includes(c));
  if (code) return new DomainError(code, message);
  if (e.code === '42501') return new DomainError(ErrorCodes.FORBIDDEN, message);
  if (/invalid login credentials/i.test(message)) return new DomainError(ErrorCodes.INVALID_CREDENTIALS, message);
  if (error instanceof TypeError || /failed to fetch|network/i.test(message)) {
    return new DomainError(ErrorCodes.NETWORK, message);
  }
  return new DomainError(ErrorCodes.UNEXPECTED, message);
}

/** Déballe `{ data, error }` des appels Supabase. */
export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw toDomainError(result.error);
  return result.data as T;
}

/** Exécute un appel en convertissant aussi les exceptions (réseau) en DomainError. */
export async function call<T>(fn: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  try {
    return unwrap(await fn());
  } catch (error) {
    throw toDomainError(error);
  }
}
