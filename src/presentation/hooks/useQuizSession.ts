import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { OpenedSession, SyncStatus } from '../../application';
import { AnswerSheet } from '../../domain';
import { useServices } from '../di/container';
import { messageFor } from '../i18n/errorMessages';

/**
 * Machine à états du passage d'un test :
 *   loading → active → submitting → closed
 *                 ↘ error            ↗ (expiration du temps)
 */
export type SessionPhase = 'loading' | 'active' | 'submitting' | 'closed' | 'error';

export interface SessionState {
  readonly phase: SessionPhase;
  readonly session: OpenedSession | null;
  readonly answers: AnswerSheet;
  readonly current: number;
  readonly sync: SyncStatus;
  readonly error: string | null;
  readonly notice: string | null;
  readonly closedReason: 'manual' | 'timeout' | 'already_closed' | null;
}

type Action =
  | { type: 'LOADED'; session: OpenedSession }
  | { type: 'ALREADY_CLOSED' }
  | { type: 'FAILED'; error: string }
  | { type: 'ANSWERS'; answers: AnswerSheet }
  | { type: 'GOTO'; index: number }
  | { type: 'SYNC'; status: SyncStatus }
  | { type: 'NOTICE'; notice: string | null }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMITTED'; reason: 'manual' | 'timeout' }
  | { type: 'SUBMIT_FAILED'; error: string };

const initialState: SessionState = {
  phase: 'loading',
  session: null,
  answers: AnswerSheet.empty(),
  current: 0,
  sync: 'idle',
  error: null,
  notice: null,
  closedReason: null,
};

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'LOADED':
      return { ...state, phase: 'active', session: action.session, answers: action.session.answers };
    case 'ALREADY_CLOSED':
      return { ...state, phase: 'closed', closedReason: 'already_closed' };
    case 'FAILED':
      return { ...state, phase: 'error', error: action.error };
    case 'ANSWERS':
      return state.phase === 'active' ? { ...state, answers: action.answers, notice: null } : state;
    case 'GOTO': {
      const max = (state.session?.data.questions.length ?? 1) - 1;
      return { ...state, current: Math.min(Math.max(0, action.index), max), notice: null };
    }
    case 'SYNC':
      return { ...state, sync: action.status };
    case 'NOTICE':
      return { ...state, notice: action.notice };
    case 'SUBMIT_START':
      return { ...state, phase: 'submitting', error: null };
    case 'SUBMITTED':
      return { ...state, phase: 'closed', closedReason: action.reason };
    case 'SUBMIT_FAILED':
      return { ...state, phase: 'active', error: action.error };
  }
}

export function useQuizSession(attemptId: string) {
  const { session: service } = useServices();
  const [state, dispatch] = useReducer(reducer, initialState);

  // Refs synchrones : deux clics plus rapides qu'un rendu ne doivent pas perdre de réponse
  const sessionRef = useRef<OpenedSession | null>(null);
  const answersRef = useRef<AnswerSheet>(AnswerSheet.empty());
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    service
      .open(attemptId)
      .then((opened) => {
        if (cancelled) return;
        if (opened.data.status !== 'in_progress') return dispatch({ type: 'ALREADY_CLOSED' });
        sessionRef.current = opened;
        answersRef.current = opened.answers;
        unsubscribe = opened.queue.onStatusChange((status) => dispatch({ type: 'SYNC', status }));
        dispatch({ type: 'LOADED', session: opened });
      })
      .catch((e) => !cancelled && dispatch({ type: 'FAILED', error: messageFor(e) }));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [attemptId, service]);

  const toggle = useCallback((questionId: string, choiceId: string) => {
    const opened = sessionRef.current;
    if (!opened || submittingRef.current) return;
    try {
      const next = answersRef.current.toggle(questionId, choiceId);
      answersRef.current = next;
      dispatch({ type: 'ANSWERS', answers: next });
      opened.queue.enqueue(questionId, next.toArray(questionId));
    } catch (e) {
      dispatch({ type: 'NOTICE', notice: messageFor(e) });
    }
  }, []);

  const goTo = useCallback((index: number) => dispatch({ type: 'GOTO', index }), []);

  const submit = useCallback(
    async (reason: 'manual' | 'timeout') => {
      const opened = sessionRef.current;
      if (!opened || submittingRef.current) return;
      submittingRef.current = true;
      dispatch({ type: 'SUBMIT_START' });
      try {
        await service.submit(attemptId, opened.queue);
        dispatch({ type: 'SUBMITTED', reason });
      } catch (e) {
        submittingRef.current = false;
        dispatch({ type: 'SUBMIT_FAILED', error: messageFor(e) });
      }
    },
    [attemptId, service],
  );

  return { state, toggle, goTo, submit };
}
