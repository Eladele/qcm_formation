/**
 * Abstraction de l'horloge (Dependency Inversion) : le domaine ne dépend pas de Date.now(),
 * ce qui rend le chronomètre testable et permet de le caler sur l'heure du serveur.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/**
 * Horloge corrigée du décalage entre le poste du candidat et le serveur.
 * Si l'horloge du PC est fausse de 10 minutes, le compte à rebours reste juste.
 */
export class ServerSyncedClock implements Clock {
  private readonly offsetMs: number;
  private readonly base: Clock;

  constructor(offsetMs: number, base: Clock = systemClock) {
    this.offsetMs = offsetMs;
    this.base = base;
  }

  /**
   * Estime le décalage en compensant la latence réseau (méthode NTP simplifiée) :
   * l'heure serveur correspond au milieu de l'aller-retour.
   */
  static fromRoundTrip(serverNowMs: number, requestStartedMs: number, responseReceivedMs: number, base: Clock = systemClock) {
    const midpoint = (requestStartedMs + responseReceivedMs) / 2;
    return new ServerSyncedClock(serverNowMs - midpoint, base);
  }

  get offset(): number {
    return this.offsetMs;
  }

  now(): number {
    return this.base.now() + this.offsetMs;
  }
}
