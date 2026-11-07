import { useCallback, useEffect, useRef, useState } from 'react';
import { messageFor } from '../i18n/errorMessages';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: (prev: T | null) => T | null) => void;
}

/** Charge une ressource asynchrone, ignore les réponses obsolètes. */
export function useAsync<T>(loader: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === requestId.current) setDataState(result);
    } catch (e) {
      if (id === requestId.current) setError(messageFor(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState(updater), []);

  return { data, error, loading, reload, setData };
}
