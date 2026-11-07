import type { Clock } from './Clock';
import { Duration } from './Duration';

export type Unsubscribe = () => void;

/** Abstraction du planificateur (setInterval) — injectable pour les tests. */
export interface Scheduler {
  every(ms: number, fn: () => void): Unsubscribe;
}

export const intervalScheduler: Scheduler = {
  every(ms, fn) {
    const handle = setInterval(fn, ms);
    return () => clearInterval(handle);
  },
};

/**
 * Pattern Observer : le compte à rebours notifie ses abonnés à chaque changement de seconde
 * et une seule fois à l'expiration.
 *
 * Le temps restant est TOUJOURS recalculé depuis l'échéance (deadline - now) : aucune
 * dérive même si l'onglet est mis en veille et que les ticks sont retardés.
 */
export class Countdown {
  private readonly deadlineMs: number;
  private readonly clock: Clock;
  private readonly scheduler: Scheduler;
  private readonly tickMs: number;

  private readonly tickListeners = new Set<(remaining: Duration) => void>();
  private readonly expireListeners = new Set<() => void>();
  private cancelTimer: Unsubscribe | null = null;
  private lastEmitted: Duration | null = null;
  private expired = false;

  constructor(deadlineMs: number, clock: Clock, scheduler: Scheduler = intervalScheduler, tickMs = 250) {
    this.deadlineMs = deadlineMs;
    this.clock = clock;
    this.scheduler = scheduler;
    this.tickMs = tickMs;
  }

  remaining(): Duration {
    return Duration.fromMs(this.deadlineMs - this.clock.now());
  }

  get isExpired(): boolean {
    return this.expired;
  }

  get isRunning(): boolean {
    return this.cancelTimer !== null;
  }

  subscribe(listener: (remaining: Duration) => void): Unsubscribe {
    this.tickListeners.add(listener);
    listener(this.remaining());
    return () => this.tickListeners.delete(listener);
  }

  onExpire(listener: () => void): Unsubscribe {
    this.expireListeners.add(listener);
    return () => this.expireListeners.delete(listener);
  }

  start(): void {
    if (this.cancelTimer || this.expired) return;
    this.tick();
    if (!this.expired) this.cancelTimer = this.scheduler.every(this.tickMs, () => this.tick());
  }

  stop(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  private tick(): void {
    const remaining = this.remaining();
    if (!this.lastEmitted || !remaining.equals(this.lastEmitted)) {
      this.lastEmitted = remaining;
      this.tickListeners.forEach((l) => l(remaining));
    }
    if (remaining.isZero() && !this.expired) {
      this.expired = true;
      this.stop();
      this.expireListeners.forEach((l) => l());
    }
  }
}

export type TimerUrgency = 'normal' | 'warning' | 'critical';

/** Règle d'affichage : orange sous 20 % du temps, rouge sous 1 minute. */
export function timerUrgency(remaining: Duration, total: Duration): TimerUrgency {
  if (remaining.totalSeconds <= 60) return 'critical';
  if (remaining.ratioOf(total) <= 0.2) return 'warning';
  return 'normal';
}
