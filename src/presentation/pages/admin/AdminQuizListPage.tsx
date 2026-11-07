import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Duration, ScoringStrategyFactory, type Quiz } from '../../../domain';
import { Alert, Badge, ConfirmDialog, EmptyState, Spinner } from '../../components/ui';
import { useServices } from '../../di/container';
import { useAsync } from '../../hooks/useAsync';
import { messageFor } from '../../i18n/errorMessages';

export function AdminQuizListPage() {
  const { admin } = useServices();
  const { data, error, loading, reload } = useAsync(() => admin.listQuizzes(), [admin]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner full />;
  const quizzes = data ?? [];
  const stats = {
    total: quizzes.length,
    published: quizzes.filter((q) => q.isPublished).length,
    questions: quizzes.reduce((s, q) => s + q.questionCount, 0),
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <p className="muted">Gérez vos tests, leurs questions et consultez les résultats.</p>
        </div>
        <Link to="/admin/quizzes/new" className="btn btn-primary">+ Nouveau test</Link>
      </div>

      <div className="stats">
        <div className="stat card"><span>Tests</span><strong>{stats.total}</strong></div>
        <div className="stat card"><span>Lancés</span><strong>{stats.published}</strong></div>
        <div className="stat card"><span>Questions</span><strong>{stats.questions}</strong></div>
      </div>

      {error && <Alert>{error}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}

      {quizzes.length === 0 ? (
        <EmptyState title="Aucun test pour l'instant">
          <Link to="/admin/quizzes/new" className="btn btn-primary">Créer mon premier test</Link>
        </EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Titre</th><th>Questions</th><th>Durée</th><th>Notation</th><th>Statut</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {quizzes.map((q) => (
                <tr key={q.id}>
                  <td><Link to={`/admin/quizzes/${q.id}`} className="strong">{q.title}</Link></td>
                  <td>{q.questionCount}</td>
                  <td className="mono">{Duration.fromSeconds(q.durationSeconds).format()}</td>
                  <td>{ScoringStrategyFactory.for(q.scoringMode).label}</td>
                  <td>{q.isPublished ? <Badge tone="success">Lancé</Badge> : <Badge>Brouillon</Badge>}</td>
                  <td className="actions">
                    <Link className="btn btn-ghost btn-sm" to={`/admin/quizzes/${q.id}`}>Modifier</Link>
                    <Link className="btn btn-ghost btn-sm" to={`/admin/quizzes/${q.id}/results`}>Résultats</Link>
                    <button className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => run(() => (q.isPublished ? admin.close(q.id) : admin.launch(q.id)))}>
                      {q.isPublished ? 'Clôturer' : 'Lancer'}
                    </button>
                    <button className="btn btn-ghost btn-sm danger-text" disabled={busy} onClick={() => setToDelete(q)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        danger
        busy={busy}
        title="Supprimer ce test ?"
        confirmLabel="Supprimer"
        message={<p>« {toDelete?.title} », ses questions et toutes les tentatives associées seront définitivement supprimés.</p>}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && run(async () => { await admin.deleteQuiz(toDelete.id); setToDelete(null); })}
      />
    </>
  );
}
