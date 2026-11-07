import { DomainError, ErrorCodes } from '../../domain';

export type SyncStatus = 'idle' | 'saving' | 'error';
type Persist = (questionId: string, choiceIds: readonly string[]) => Promise<void>;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * File de sauvegarde automatique des réponses (pattern Command + coalescence).
 *
 * - Les clics rapides sur une même question sont fusionnés : seule la dernière
 *   sélection est envoyée (« last write wins »).
 * - Les envois sont séquentiels → pas de course entre deux requêtes d'une même question.
 * - Les erreurs réseau sont réessayées ; les erreurs métier (tentative expirée…) non.
 * - flush() garantit que tout est persisté avant la soumission finale.
 */
export class AnswerSyncQueue {
  private readonly persist: Persist;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  private readonly pending = new Map<string, readonly string[]>();
  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private running: Promise<void> | null = null;
  private lastError: unknown = null;
  private status: SyncStatus = 'idle';

  constructor(persist: Persist, options: { maxRetries?: number; retryDelayMs?: number } = {}) {
    this.persist = persist;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 800;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  enqueue(questionId: string, choiceIds: readonly string[]): void {
    this.pending.set(questionId, [...choiceIds]);
    this.kick();
  }

  /** Attend que toutes les réponses en attente soient persistées. Lève l'erreur sinon. */
  async flush(): Promise<void> {
    if (this.running) await this.running;
    // Dernière chance pour les erreurs réseau ; une erreur métier ne se résoudra pas en réessayant
    if (this.pending.size > 0 && !this.isBusinessError(this.lastError)) {
      this.kick();
      await this.running;
    }
    if (this.pending.size > 0) throw this.lastError ?? new Error('SYNC_FAILED');
  }

  private kick(): void {
    if (this.running) return;
    this.running = this.drain().finally(() => {
      this.running = null;
      // Une réponse arrivée pendant la fin du drain ne doit pas être oubliée
      if (this.pending.size > 0 && this.status !== 'error') this.kick();
    });
  }

  private async drain(): Promise<void> {
    this.setStatus('saving');
    while (this.pending.size > 0) {
      const next = this.pending.entries().next().value;
      if (!next) break;
      const [questionId, choiceIds] = next;
      this.pending.delete(questionId);
      try {
        await this.persistWithRetry(questionId, choiceIds);
      } catch (error) {
        // On remet la réponse en file sauf si une plus récente l'a remplacée entre-temps
        if (!this.pending.has(questionId)) this.pending.set(questionId, choiceIds);
        this.lastError = error;
        this.setStatus('error');
        return;
      }
    }
    this.lastError = null;
    this.setStatus('idle');
  }

  private async persistWithRetry(questionId: string, choiceIds: readonly string[]): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.persist(questionId, choiceIds);
      } catch (error) {
        if (this.isBusinessError(error) || attempt >= this.maxRetries) throw error;
        await wait(this.retryDelayMs * (attempt + 1)); // back-off linéaire
      }
    }
  }

  private isBusinessError(error: unknown): boolean {
    return error instanceof DomainError && error.code !== ErrorCodes.NETWORK && error.code !== ErrorCodes.UNEXPECTED;
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.listeners.forEach((l) => l(status));
  }
}
