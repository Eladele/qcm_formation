import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useServices } from '../di/container';
import { useAsync } from '../hooks/useAsync';
import { messageFor } from '../i18n/errorMessages';
import { Alert, Spinner } from './ui';

/** Choix des candidats qui pourront passer le test. */
export function AssignmentPanel({ quizId, onChange }: { quizId: string; onChange?: (count: number) => void }) {
  const { admin, candidates } = useServices();
  const data = useAsync(
    async () => {
      const [all, assigned] = await Promise.all([candidates.list(), admin.listAssignedCandidateIds(quizId)]);
      return { all, assigned };
    },
    [admin, candidates, quizId],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (data.data) {
      setSelected(new Set(data.data.assigned));
      onChange?.(data.data.assigned.length);
    }
  }, [data.data, onChange]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (data.data?.all ?? []).filter((c) => c.isActive && (!f || c.fullName.toLowerCase().includes(f) || (c.phone ?? '').includes(f)));
  }, [data.data, filter]);

  if (data.loading && !data.data) return <Spinner />;
  if (data.error) return <Alert>{data.error}</Alert>;
  const dirty = data.data ? selected.size !== data.data.assigned.length || data.data.assigned.some((id) => !selected.has(id)) : false;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await admin.assignCandidates(quizId, [...selected]);
      await data.reload();
      setMsg({ kind: 'success', text: `${selected.size} candidat(s) affecté(s).` });
    } catch (e) {
      setMsg({ kind: 'error', text: messageFor(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {data.data && data.data.all.length === 0 ? (
        <p className="muted">Aucun candidat. <Link to="/admin/candidates">Créer des candidats</Link></p>
      ) : (
        <>
          <div className="row">
            <input type="text" placeholder="Rechercher un candidat…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set([...selected, ...visible.map((c) => c.id)]))}>Tout cocher</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Tout décocher</button>
            <span className="muted small">{selected.size} sélectionné(s)</span>
          </div>
          <ul className="assign-list">
            {visible.map((c) => (
              <li key={c.id}>
                <label className="checkbox">
                  <input type="checkbox" checked={selected.has(c.id)}
                    onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                  <span>{c.fullName}</span>
                  {c.phone && <span className="muted small">{c.phone}</span>}
                </label>
              </li>
            ))}
          </ul>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <button className="btn btn-secondary" disabled={!dirty || busy} onClick={save}>
            {busy ? 'Enregistrement…' : 'Enregistrer l’affectation'}
          </button>
        </>
      )}
    </div>
  );
}
