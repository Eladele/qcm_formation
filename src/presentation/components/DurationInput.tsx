import { Duration } from '../../domain';

/** Saisie d'une durée en heures / minutes / secondes. */
export function DurationInput({ value, onChange, invalid }: { value: number; onChange: (seconds: number) => void; invalid?: boolean }) {
  const d = Duration.fromSeconds(value);
  const set = (h: number, m: number, s: number) => onChange(Duration.fromParts(h, m, s).totalSeconds);
  const clamp = (raw: string, max: number) => Math.min(max, Math.max(0, Math.floor(Number(raw) || 0)));

  return (
    <div className={`duration-input ${invalid ? 'invalid' : ''}`}>
      <label>
        <input type="number" min={0} max={24} value={d.hours} onChange={(e) => set(clamp(e.target.value, 24), d.minutes, d.seconds)} />
        <span>h</span>
      </label>
      <label>
        <input type="number" min={0} max={59} value={d.minutes} onChange={(e) => set(d.hours, clamp(e.target.value, 59), d.seconds)} />
        <span>min</span>
      </label>
      <label>
        <input type="number" min={0} max={59} value={d.seconds} onChange={(e) => set(d.hours, d.minutes, clamp(e.target.value, 59))} />
        <span>s</span>
      </label>
      <span className="duration-preview">= {d.format()}</span>
    </div>
  );
}
