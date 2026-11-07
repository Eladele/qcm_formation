import { Link, useParams } from 'react-router-dom';
import { Duration } from '../../../domain';
import { Alert, Badge, EmptyState, Spinner, formatDateTime, formatPoints } from '../../components/ui';
import { useServices } from '../../di/container';
import { useAsync } from '../../hooks/useAsync';

const STATUS = {
  in_progress: <Badge tone="accent">En cours</Badge>,
  submitted: <Badge tone="success">Soumis</Badge>,
  expired: <Badge tone="warning">Temps écoulé</Badge>,
} as const;

export function QuizResultsPage() {
  const { quizId = '' } = useParams();
  const { admin, session } = useServices();
  const quiz = useAsync(() => admin.getQuiz(quizId), [admin, quizId]);
  const attempts = useAsync(() => session.listAttempts(quizId), [session, quizId]);

  if (quiz.loading || attempts.loading) return <Spinner full />;
  const list = attempts.data ?? [];
  const finished = list.filter((a) => a.status !== 'in_progress' && a.maxScore);
  const avg = finished.length
    ? Math.round(finished.reduce((s, a) => s + (a.score ?? 0) / (a.maxScore ?? 1), 0) / finished.length * 100)
    : null;

  return (
    <>
      <Link to={`/admin/quizzes/${quizId}`} className="back-link">← Retour au test</Link>
      <div className="page-head">
        <div>
          <h1>Résultats</h1>
          <p className="muted">{quiz.data?.title}</p>
        </div>
      </div>
      {(quiz.error || attempts.error) && <Alert>{quiz.error ?? attempts.error}</Alert>}

      <div className="stats">
        <div className="stat card"><span>Tentatives</span><strong>{list.length}</strong></div>
        <div className="stat card"><span>Terminées</span><strong>{finished.length}</strong></div>
        <div className="stat card"><span>Moyenne</span><strong>{avg === null ? '—' : `${avg} %`}</strong></div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Aucune tentative pour ce test" />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Candidat</th><th>Statut</th><th>Score</th><th>Début</th><th>Durée</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="strong">{a.candidateName}</td>
                  <td>{STATUS[a.status]}</td>
                  <td>{a.score === null ? '—' : `${formatPoints(a.score)} / ${formatPoints(a.maxScore ?? 0)}`}</td>
                  <td>{formatDateTime(a.startedAt)}</td>
                  <td className="mono">
                    {a.submittedAt ? Duration.fromMs(Date.parse(a.submittedAt) - Date.parse(a.startedAt)).format() : '—'}
                  </td>
                  <td className="actions">
                    {a.status !== 'in_progress' && <Link className="btn btn-ghost btn-sm" to={`/attempt/${a.id}/result`}>Détail</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
