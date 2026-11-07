import { memo } from 'react';
import { Duration, timerUrgency, type Clock } from '../../domain';
import { useCountdown } from '../hooks/useCountdown';

interface TimerProps {
  deadlineMs: number;
  clock: Clock;
  totalSeconds: number;
  onExpire: () => void;
}

/**
 * Chronomètre HH:MM:SS. Isolé et mémoïsé : il est le seul composant
 * re-rendu chaque seconde, pas toute la page du test.
 */
export const Timer = memo(function Timer({ deadlineMs, clock, totalSeconds, onExpire }: TimerProps) {
  const remaining = useCountdown(deadlineMs, clock, onExpire);
  const total = Duration.fromSeconds(totalSeconds);
  const urgency = timerUrgency(remaining, total);
  const ratio = remaining.ratioOf(total);
  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className={`timer timer-${urgency}`} role="timer" aria-label={`Temps restant ${remaining.format()}`}>
      <div className="timer-label">Temps restant</div>
      <div className="timer-digits" aria-hidden>
        <span className="timer-unit"><b>{pad(remaining.hours)}</b><small>h</small></span>
        <span className="timer-sep">:</span>
        <span className="timer-unit"><b>{pad(remaining.minutes)}</b><small>min</small></span>
        <span className="timer-sep">:</span>
        <span className="timer-unit"><b>{pad(remaining.seconds)}</b><small>s</small></span>
      </div>
      <div className="timer-bar"><span style={{ width: `${ratio * 100}%` }} /></div>
      {/* Annonce vocale uniquement aux paliers importants (accessibilité) */}
      <span className="sr-only" aria-live="assertive">
        {[300, 60, 10].includes(remaining.totalSeconds) ? `Plus que ${remaining.humanize()}` : ''}
      </span>
    </div>
  );
});
