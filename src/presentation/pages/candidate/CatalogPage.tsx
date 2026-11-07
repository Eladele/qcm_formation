import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Duration, availabilityOf, type AvailableQuiz } from '../../../domain';
import { useServices } from '../../di/container';
import { useAsync } from '../../hooks/useAsync';
import { messageFor } from '../../i18n/errorMessages';
import { Alert, Badge, ConfirmDialog, EmptyState, Spinner, formatPoints } from '../../components/ui';

export function CatalogPage() {
  const { session } = useServices();
  const navigate = useNavigate();
  const { data, error, loading } = useAsync(() => session.listAvailable(), [session]);
  const [pending, setPending] = useState<AvailableQuiz | null>(null);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const start = async (quiz: AvailableQuiz) => {
    setBusy(true);
    setStartError(null);
    try {
      const attemptId = await session.start(quiz.id);
      navigate(`/attempt/${attemptId}`);
    } catch (e) {
      setStartError(messageFor(e));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner full label="Chargement des tests…" />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes tests</h1>
          <p className="muted">Choisissez un test. Le chronomètre démarre dès que vous commencez.</p>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {startError && <Alert>{startError}</Alert>}
      {data && data.length === 0 && <EmptyState title="Aucun test disponible pour le moment" />}

      <div className="quiz-grid">
        {data?.map((quiz) => {
          const availability = availabilityOf(quiz);
          return (
            <article key={quiz.id} className="card quiz-card">
              <div className="quiz-card-head">
                <h3>{quiz.title}</h3>
                {availability === 'resume' && <Badge tone="warning">En cours</Badge>}
                {availability === 'exhausted' && <Badge tone="neutral">Terminé</Badge>}
              </div>
              {quiz.description && <p className="muted clamp-3">{quiz.description}</p>}
              <dl className="meta">
                <div><dt>Durée</dt><dd>{Duration.fromSeconds(quiz.durationSeconds).humanize()}</dd></div>
                <div><dt>Questions</dt><dd>{quiz.questionCount}</dd></div>
                <div><dt>Tentatives</dt><dd>{quiz.attemptsUsed} / {quiz.maxAttempts}</dd></div>
                {quiz.bestScore !== null && (
                  <div><dt>Meilleur score</dt><dd>{formatPoints(quiz.bestScore)} / {formatPoints(quiz.maxScore)}</dd></div>
                )}
              </dl>
              <div className="quiz-card-actions">
                {quiz.lastAttemptId && (
                  <Link className="btn btn-ghost" to={`/attempt/${quiz.lastAttemptId}/result`}>Dernier résultat</Link>
                )}
                {availability === 'resume' && (
                  <button className="btn btn-warning" onClick={() => navigate(`/attempt/${quiz.inProgressAttemptId}`)}>Reprendre</button>
                )}
                {availability === 'start' && (
                  <button className="btn btn-primary" onClick={() => setPending(quiz)}>Commencer</button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={`Commencer « ${pending?.title ?? ''} » ?`}
        busy={busy}
        confirmLabel="Démarrer le chronomètre"
        onCancel={() => setPending(null)}
        onConfirm={() => pending && start(pending)}
        message={
          pending && (
            <ul className="rules-list">
              <li>Durée : <strong>{Duration.fromSeconds(pending.durationSeconds).format()}</strong> (HH:MM:SS)</li>
              <li>{pending.questionCount} questions, chacune avec 4 propositions dont 1 à 3 correctes.</li>
              <li>Vos réponses sont enregistrées automatiquement.</li>
              <li>Fermer la page n'arrête pas le chronomètre. À zéro, le test est soumis automatiquement.</li>
            </ul>
          )
        }
      />
    </>
  );
}
