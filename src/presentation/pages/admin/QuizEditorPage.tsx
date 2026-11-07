import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CHOICE_LETTERS, QuestionDraftFactory, QuizDraftFactory, type Question, type QuestionDraft, type QuizDraft } from '../../../domain';
import { AssignmentPanel } from '../../components/AssignmentPanel';
import { QuestionForm } from '../../components/QuestionForm';
import { QuizSettingsForm } from '../../components/QuizSettingsForm';
import { Alert, Badge, ConfirmDialog, EmptyState, Modal, Spinner, formatPoints } from '../../components/ui';
import { useServices } from '../../di/container';
import { useAsync } from '../../hooks/useAsync';
import { messageFor } from '../../i18n/errorMessages';

/** Création d'un test : seulement les paramètres, puis redirection vers l'éditeur complet. */
export function NewQuizPage() {
  const { admin } = useServices();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (draft: QuizDraft) => {
    setBusy(true);
    setError(null);
    try {
      const quiz = await admin.createQuiz(draft);
      navigate(`/admin/quizzes/${quiz.id}`, { replace: true });
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <Link to="/admin" className="back-link">← Tableau de bord</Link>
      <h1>Nouveau test</h1>
      <div className="card">
        <QuizSettingsForm initial={QuizDraftFactory.empty()} submitLabel="Créer et ajouter des questions" busy={busy} serverError={error} onSubmit={create} />
      </div>
    </div>
  );
}

type Editing = { mode: 'create' } | { mode: 'edit'; question: Question } | null;

export function QuizEditorPage() {
  const { quizId = '' } = useParams();
  const { admin } = useServices();
  const quiz = useAsync(() => admin.getQuiz(quizId), [admin, quizId]);
  const questions = useAsync(() => admin.listQuestions(quizId), [admin, quizId]);

  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [assignedCount, setAssignedCount] = useState(0);
  const onAssignedChange = useCallback((n: number) => setAssignedCount(n), []);

  if (quiz.loading && !quiz.data) return <Spinner full />;
  if (quiz.error || !quiz.data) return <Alert>{quiz.error}</Alert>;
  const current = quiz.data;
  const list = questions.data ?? [];
  const totalPoints = list.reduce((s, q) => s + q.points, 0);

  const withBusy = async (fn: () => Promise<void>, onError: (m: string) => void) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = (draft: QuizDraft) =>
    withBusy(async () => {
      setError(null);
      const updated = await admin.updateQuiz(current.id, draft);
      quiz.setData(() => updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, setError);

  const saveQuestion = (draft: QuestionDraft) =>
    withBusy(async () => {
      setFormError(null);
      await admin.saveQuestion(current.id, draft, editing?.mode === 'edit' ? editing.question.id : undefined);
      setEditing(null);
      await questions.reload();
    }, setFormError);

  const togglePublish = () =>
    withBusy(async () => {
      setError(null);
      if (current.isPublished) await admin.close(current.id);
      else await admin.launch(current.id);
      await quiz.reload();
    }, setError);

  const deleteQuestion = (q: Question) =>
    withBusy(async () => {
      setError(null);
      await admin.deleteQuestion({ ...current, questionCount: list.length }, q.id);
      setToDelete(null);
      await questions.reload();
    }, (m) => {
      setToDelete(null);
      setError(m);
    });

  return (
    <>
      <Link to="/admin" className="back-link">← Tableau de bord</Link>
      <div className="page-head">
        <div>
          <h1>{current.title}</h1>
          <div className="row">
            {current.isPublished ? <Badge tone="success">Lancé</Badge> : <Badge>Brouillon</Badge>}
            <span className="muted">{list.length} question(s) · {formatPoints(totalPoints)} points · {assignedCount} candidat(s)</span>
          </div>
        </div>
        <div className="row">
          <Link className="btn btn-ghost" to={`/admin/quizzes/${current.id}/results`}>Résultats</Link>
          <button className={`btn ${current.isPublished ? 'btn-secondary' : 'btn-success'}`} disabled={busy} onClick={togglePublish}>
            {current.isPublished ? 'Clôturer le test' : '▶ Lancer le test'}
          </button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="editor-layout">
        <aside className="card">
          <h2 className="section-title">Paramètres</h2>
          <QuizSettingsForm key={current.id} initial={QuizDraftFactory.fromQuiz(current)} submitLabel="Enregistrer" busy={busy} onSubmit={saveSettings} />
          {saved && <Alert kind="success">Paramètres enregistrés.</Alert>}
          <h2 className="section-title">Candidats affectés</h2>
          <p className="hint">Seuls ces candidats verront le test une fois lancé. Leur chronomètre démarre quand ils cliquent sur « Commencer ».</p>
          <AssignmentPanel quizId={current.id} onChange={onAssignedChange} />
        </aside>

        <section className="stack">
          <div className="section-head">
            <h2 className="section-title">Questions</h2>
            <button className="btn btn-primary" onClick={() => { setFormError(null); setEditing({ mode: 'create' }); }}>+ Ajouter une question</button>
          </div>

          {questions.loading && !questions.data && <Spinner />}
          {list.length === 0 && !questions.loading && (
            <EmptyState title="Aucune question">
              <p className="muted">Chaque question comporte 4 choix, dont 1 à 3 corrects.</p>
            </EmptyState>
          )}

          {list.map((q, i) => (
            <article key={q.id} className="card question-admin">
              <header className="question-head">
                <span className="question-index">Q{i + 1}</span>
                <Badge>{formatPoints(q.points)} pt</Badge>
                <Badge tone="accent">{q.choices.filter((c) => c.isCorrect).length} bonne(s) réponse(s)</Badge>
                <span className="spacer" />
                <button className="btn btn-ghost btn-sm" onClick={() => { setFormError(null); setEditing({ mode: 'edit', question: q }); }}>Modifier</button>
                <button className="btn btn-ghost btn-sm danger-text" onClick={() => setToDelete(q)}>Supprimer</button>
              </header>
              <p className="strong">{q.statement}</p>
              <ul className="choice-preview">
                {q.choices.map((c, ci) => (
                  <li key={c.id} className={c.isCorrect ? 'correct' : ''}>
                    <span className="choice-letter">{CHOICE_LETTERS[ci]}</span>
                    {c.label}
                    {c.isCorrect && <span className="answer-tag">✓ Vrai</span>}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </div>

      <Modal open={editing !== null} wide title={editing?.mode === 'edit' ? 'Modifier la question' : 'Nouvelle question'} onClose={() => !busy && setEditing(null)}>
        {editing && (
          <QuestionForm
            key={editing.mode === 'edit' ? editing.question.id : 'new'}
            initial={editing.mode === 'edit' ? QuestionDraftFactory.fromQuestion(editing.question) : undefined}
            busy={busy}
            serverError={formError}
            onSubmit={saveQuestion}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        danger
        busy={busy}
        title="Supprimer cette question ?"
        confirmLabel="Supprimer"
        message={<p>{toDelete?.statement}</p>}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteQuestion(toDelete)}
      />
    </>
  );
}
