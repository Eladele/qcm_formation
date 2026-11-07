import { Link, useLocation, useParams } from 'react-router-dom';
import { CHOICE_LETTERS, Duration } from '../../../domain';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Spinner, formatDateTime, formatPoints } from '../../components/ui';
import { useServices } from '../../di/container';
import { useAsync } from '../../hooks/useAsync';

function ScoreRing({ percentage }: { percentage: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = percentage >= 70 ? 'good' : percentage >= 50 ? 'mid' : 'low';
  return (
    <svg className={`ring ring-${tone}`} viewBox="0 0 120 120" role="img" aria-label={`${percentage} %`}>
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle cx="60" cy="60" r={r} className="ring-value" strokeDasharray={c} strokeDashoffset={c * (1 - percentage / 100)} />
      <text x="60" y="66" textAnchor="middle">{percentage}%</text>
    </svg>
  );
}

export function ResultPage() {
  const { attemptId = '' } = useParams();
  const { session } = useServices();
  const { user } = useAuth();
  const location = useLocation();
  const reason = (location.state as { reason?: string } | null)?.reason;
  const { data, error, loading } = useAsync(() => session.getResult(attemptId), [session, attemptId]);

  if (loading) return <Spinner full label="Calcul du résultat…" />;
  if (error || !data) return <Alert>{error}</Alert>;

  const { result, breakdown, percentage } = data;
  const elapsed = result.submittedAt
    ? Duration.fromMs(Date.parse(result.submittedAt) - Date.parse(result.startedAt)).format()
    : '—';

  return (
    <div className="stack-lg">
      {reason === 'timeout' && <Alert kind="warning">Le temps est écoulé : vos réponses ont été soumises automatiquement.</Alert>}

      <section className="card result-hero">
        <ScoreRing percentage={percentage} />
        <div className="result-summary">
          <p className="muted">{result.quizTitle}</p>
          <h1>{formatPoints(result.score)} <span className="muted">/ {formatPoints(result.maxScore)} pts</span></h1>
          <div className="row">
            {result.status === 'expired' ? <Badge tone="warning">Temps écoulé</Badge> : <Badge tone="success">Soumis</Badge>}
            <Badge>Durée : {elapsed}</Badge>
            <Badge>Terminé le {formatDateTime(result.submittedAt)}</Badge>
          </div>
        </div>
        <div className="result-actions">
          <Link className="btn btn-ghost" to={user?.role === 'admin' ? `/admin/quizzes/${result.quizId}/results` : '/'}>Retour</Link>
        </div>
      </section>

      {!result.showCorrection && <Alert kind="info">La correction détaillée n'est pas disponible pour ce test.</Alert>}

      {result.questions.map((q, qi) => {
        const earned = breakdown?.earned[qi] ?? 0;
        const status = earned === q.points ? 'full' : earned > 0 ? 'partial' : 'none';
        return (
          <article key={q.id} className={`card correction correction-${status}`}>
            <header className="question-head">
              <span className="question-index">Question {qi + 1}</span>
              <Badge tone={status === 'full' ? 'success' : status === 'partial' ? 'warning' : 'danger'}>
                {formatPoints(earned)} / {formatPoints(q.points)} pt
              </Badge>
            </header>
            <h3>{q.statement}</h3>
            <ul className="answer-list">
              {q.choices.map((c, ci) => {
                const kind = c.isCorrect ? (c.selected ? 'hit' : 'missed') : c.selected ? 'wrong' : 'neutral';
                const label = { hit: 'Bonne réponse cochée', missed: 'Bonne réponse oubliée', wrong: 'Mauvaise réponse cochée', neutral: '' }[kind];
                return (
                  <li key={c.id} className={`answer answer-${kind}`}>
                    <span className="answer-letter">{CHOICE_LETTERS[ci]}</span>
                    <span className="answer-label">{c.label}</span>
                    {label && <span className="answer-tag">{label}</span>}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
