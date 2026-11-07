import { useEffect, useRef, useState } from 'react';
import { Countdown, Duration, type Clock } from '../../domain';

/**
 * Adaptateur React du Countdown (Observer) : re-rend le composant
 * une fois par seconde et déclenche onExpire une seule fois.
 */
export function useCountdown(deadlineMs: number, clock: Clock, onExpire?: () => void): Duration {
  const [remaining, setRemaining] = useState(() => Duration.fromMs(deadlineMs - clock.now()));
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const countdown = new Countdown(deadlineMs, clock);
    const unsubscribeTick = countdown.subscribe(setRemaining);
    const unsubscribeExpire = countdown.onExpire(() => onExpireRef.current?.());
    countdown.start();
    return () => {
      unsubscribeTick();
      unsubscribeExpire();
      countdown.stop();
    };
  }, [deadlineMs, clock]);

  return remaining;
}
