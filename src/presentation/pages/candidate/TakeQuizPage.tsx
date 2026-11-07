import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { QuestionNavigator } from '../../components/QuestionNavigator';
import { QuestionView } from '../../components/QuestionView';
import { Timer } from '../../components/Timer';
import { Alert, ConfirmDialog, Spinner } from '../../components/ui';
import { useQuizSession } from '../../hooks/useQuizSession';

const SYNC_LABEL = { idle: 'Enregistré', saving: 'Enregistrement…', error: 'Hors ligne — nouvel essai' } as const;

export function TakeQuizPage() {
  const { attemptId = '' } = useParams();
  const { state, toggle, goTo, submit } = useQuizSession(attemptId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const onExpire = useCallback(() => void submit('timeout'), [submit]);

  // Avertit avant de quitter la page pendant le test
  useEffect(() => {
    if (state.phase !== 'active') return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.phase]);

  // Navigation clavier ← →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmOpen || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') goTo(state.current + 1);
      if (e.key === 'ArrowLeft') goTo(state.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, state.current, confirmOpen]);

  if (state.phase === 'loading') return <Spinner full label="Préparation du test…" />;
  if (state.phase === 'error') return <Alert>{state.error}</Alert>;
  if (state.phase === 'closed') {
    return <Navigate to={`/attempt/${attemptId}/result`} replace state={{ reason: state.closedReason }} />;
  }

  const session = state.session!;
  const { questions, quizTitle, durationSeconds } = session.data;
  const question = questions[state.current];
  const unanswered = questions.length - state.answers.answeredCount;
  const locked = state.phase === 'submitting';

  return (
    <div className="take-layout">
      <header className="take-header card">
        <div>
          <h1 className="take-title">{quizTitle}</h1>
          <div className="progress-line">
            <div className="progress"><span style={{ width: `${(state.answers.answeredCount / Math.max(1, questions.length)) * 100}%` }} /></div>
            <span className="muted">{state.answers.answeredCount} / {questions.length} répondues</span>
            <span className={`sync sync-${state.sync}`}>● {SYNC_LABEL[state.sync]}</span>
          </div>
        </div>
        <Timer deadlineMs={session.deadlineMs} clock={session.clock} totalSeconds={durationSeconds} onExpire={onExpire} />
      </header>

      {state.error && <Alert>{state.error}</Alert>}
      {state.notice && <Alert kind="warning">{state.notice}</Alert>}
      {locked && <Alert kind="info">Soumission en cours…</Alert>}

      <div className="take-body">
        <section>
          {question && (
            <QuestionView
              question={question}
              index={state.current}
              total={questions.length}
              answers={state.answers}
              disabled={locked}
              onToggle={toggle}
            />
          )}
          <div className="pager">
            <button className="btn btn-ghost" disabled={state.current === 0} onClick={() => goTo(state.current - 1)}>← Précédente</button>
            {state.current < questions.length - 1 ? (
              <button className="btn btn-secondary" onClick={() => goTo(state.current + 1)}>Suivante →</button>
            ) : (
              <button className="btn btn-primary" disabled={locked} onClick={() => setConfirmOpen(true)}>Terminer le test</button>
            )}
          </div>
        </section>

        <aside className="card side-panel">
          <h3>Questions</h3>
          <QuestionNavigator questions={questions} answers={state.answers} current={state.current} onSelect={goTo} />
          <div className="legend">
            <span><i className="dot answered" /> Répondue</span>
            <span><i className="dot" /> Sans réponse</span>
          </div>
          <button className="btn btn-primary btn-block" disabled={locked} onClick={() => setConfirmOpen(true)}>
            Soumettre mes réponses
          </button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Soumettre le test ?"
        confirmLabel="Soumettre définitivement"
        busy={locked}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void submit('manual');
        }}
        message={
          unanswered > 0 ? (
            <Alert kind="warning">Attention : {unanswered} question(s) sans réponse. Elles compteront 0 point.</Alert>
          ) : (
            <p>Toutes les questions ont une réponse. Vous ne pourrez plus les modifier.</p>
          )
        }
      />
    </div>
  );
}
