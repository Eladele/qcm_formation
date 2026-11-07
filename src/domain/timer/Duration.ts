/** Value Object immuable représentant une durée positive. */
export class Duration {
  private readonly ms: number;

  private constructor(ms: number) {
    this.ms = Math.max(0, Math.floor(Number.isFinite(ms) ? ms : 0));
  }

  static fromMs(ms: number): Duration {
    return new Duration(ms);
  }

  static fromSeconds(seconds: number): Duration {
    return new Duration(seconds * 1000);
  }

  static fromParts(hours: number, minutes: number, seconds: number): Duration {
    return Duration.fromSeconds(hours * 3600 + minutes * 60 + seconds);
  }

  static zero(): Duration {
    return new Duration(0);
  }

  get milliseconds(): number {
    return this.ms;
  }

  /** Arrondi au supérieur : il reste 0,4 s → on affiche encore 00:00:01. */
  get totalSeconds(): number {
    return Math.ceil(this.ms / 1000);
  }

  get hours(): number {
    return Math.floor(this.totalSeconds / 3600);
  }

  get minutes(): number {
    return Math.floor((this.totalSeconds % 3600) / 60);
  }

  get seconds(): number {
    return this.totalSeconds % 60;
  }

  isZero(): boolean {
    return this.ms === 0;
  }

  equals(other: Duration): boolean {
    return this.totalSeconds === other.totalSeconds;
  }

  /** Format HH:MM:SS (les heures peuvent dépasser 99 sans tronquer). */
  format(): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(this.hours)}:${pad(this.minutes)}:${pad(this.seconds)}`;
  }

  /** Format lisible : « 1 h 30 min », « 45 min », « 30 s ». */
  humanize(): string {
    const parts: string[] = [];
    if (this.hours) parts.push(`${this.hours} h`);
    if (this.minutes) parts.push(`${this.minutes} min`);
    if (this.seconds || parts.length === 0) parts.push(`${this.seconds} s`);
    return parts.join(' ');
  }

  ratioOf(total: Duration): number {
    return total.ms === 0 ? 0 : Math.min(1, this.ms / total.ms);
  }
}
