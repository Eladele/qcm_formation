import { useEffect, useState } from 'react';

interface QuestionTimerProps {
  durationSeconds: number;
  questionIndex: number;
  onExpire: () => void;
}

export function QuestionTimer({ durationSeconds, questionIndex, onExpire }: QuestionTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    setRemaining(durationSeconds);
    const deadline = Date.now() + durationSeconds * 1000;

    const interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [durationSeconds, questionIndex, onExpire]);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const ratio = Math.max(0, Math.min(1, remaining / Math.max(1, durationSeconds)));
  const urgency = remaining <= 10 ? 'critical' : remaining <= 30 ? 'warning' : 'normal';

  return (
    <div className={`question-timer-card timer timer-${urgency}`} role="timer" aria-label={`Temps pour cette question : ${minutes}m ${seconds}s`}>
      <div className="timer-label">Chronomètre de la question</div>
      <div className="timer-digits" aria-hidden>
        <span className="timer-unit"><b>{pad(minutes)}</b><small>min</small></span>
        <span className="timer-sep">:</span>
        <span className="timer-unit"><b>{pad(seconds)}</b><small>s</small></span>
      </div>
      <div className="timer-bar">
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

