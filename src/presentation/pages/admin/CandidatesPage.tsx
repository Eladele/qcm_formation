import { useMemo, useState } from 'react';
import { candidateValidator, type Candidate, type CandidateDraft, type QrBadge } from '../../../domain';
import { BadgeSheet } from '../../components/QrBadges';
import { Alert, Badge, ConfirmDialog, EmptyState, Modal, Spinner, formatDateTime } from '../../components/ui';
import { useServices } from '../../di/container';
import { useAsync } from '../../hooks/useAsync';
import { messageFor } from '../../i18n/errorMessages';

function CandidateForm({ busy, error, onSubmit, onCancel }: { busy: boolean; error: string | null; onSubmit: (d: CandidateDraft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<CandidateDraft>({ fullName: '', phone: '' });
  const [submitted, setSubmitted] = useState(false);
  const issues = useMemo(() => candidateValidator.validate(draft), [draft]);
  const err = (f: string) => (submitted ? issues.find((i) => i.field === f)?.message : undefined);

  return (
    <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (!issues.length) onSubmit(draft); }}>
      <div className="field">
        <label htmlFor="c-name">Nom complet</label>
        <input id="c-name" type="text" autoFocus value={draft.fullName} className={err('fullName') ? 'invalid' : ''}
          onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
        {err('fullName') && <p className="field-error">{err('fullName')}</p>}
      </div>
      <div className="field">
        <label htmlFor="c-phone">Téléphone <span className="muted">(facultatif, pour l'identifier)</span></label>
        <input id="c-phone" type="text" inputMode="tel" value={draft.phone} className={err('phone') ? 'invalid' : ''}
          onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+33 6 12 34 56 78" />
        {err('phone') && <p className="field-error">{err('phone')}</p>}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer et générer le QR'}</button>
      </div>
    </form>
  );
}

export function CandidatesPage() {
  const { candidates } = useServices();
  const { data, error, loading, reload } = useAsync(() => candidates.list(), [candidates]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<QrBadge[] | null>(null);
  const [confirmRegen, setConfirmRegen] = useState<Candidate[] | null>(null);
  const [toDelete, setToDelete] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = data ?? [];
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (loading && !data) return <Spinner full />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Candidats</h1>
          <p className="muted">Chaque candidat se connecte en scannant le QR code de son badge — sans email ni mot de passe.</p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" disabled={selected.size === 0 || busy}
            onClick={() => setConfirmRegen(list.filter((c) => selected.has(c.id)))}>
            Générer les badges ({selected.size})
          </button>
          <button className="btn btn-primary" onClick={() => { setActionError(null); setCreating(true); }}>+ Ajouter un candidat</button>
        </div>
      </div>

      {(error || actionError) && <Alert>{error ?? actionError}</Alert>}

      {list.length === 0 ? (
        <EmptyState title="Aucun candidat"><p className="muted">Ajoutez des candidats puis imprimez leurs badges QR.</p></EmptyState>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Tout sélectionner" checked={selected.size === list.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(list.map((c) => c.id)) : new Set())} /></th>
                <th>Nom</th><th>Téléphone</th><th>QR</th><th>Dernière connexion</th><th>Statut</th><th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Sélectionner ${c.fullName}`} /></td>
                  <td className="strong">{c.fullName}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.hasActiveQr ? <Badge tone="success">Actif</Badge> : <Badge tone="warning">Aucun</Badge>}</td>
                  <td>{formatDateTime(c.lastLoginAt)}</td>
                  <td>{c.isActive ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}</td>
                  <td className="actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy || !c.isActive} onClick={() => setConfirmRegen([c])}>Nouveau QR</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => run(async () => { await candidates.setActive(c.id, !c.isActive); await reload(); })}>
                      {c.isActive ? 'Désactiver' : 'Réactiver'}
                    </button>
                    <button className="btn btn-ghost btn-sm danger-text" disabled={busy} onClick={() => setToDelete(c)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} title="Nouveau candidat" onClose={() => !busy && setCreating(false)}>
        <CandidateForm busy={busy} error={actionError} onCancel={() => setCreating(false)}
          onSubmit={(d) => run(async () => { const b = await candidates.create(d); setCreating(false); setBadges([b]); await reload(); })} />
      </Modal>

      <ConfirmDialog
        open={confirmRegen !== null}
        busy={busy}
        title="Générer de nouveaux badges QR ?"
        confirmLabel="Générer"
        message={<p>Les anciens QR de {confirmRegen?.length} candidat(s) cesseront immédiatement de fonctionner.</p>}
        onCancel={() => setConfirmRegen(null)}
        onConfirm={() => confirmRegen && run(async () => {
          const b = await candidates.regenerateBadges(confirmRegen.filter((c) => c.isActive));
          setConfirmRegen(null);
          setBadges(b);
          await reload();
        })}
      />

      <Modal open={badges !== null} wide title="Badges de connexion" onClose={() => setBadges(null)}
        footer={<>
          <span className="muted small">Ces QR ne seront plus affichables après fermeture : imprimez-les maintenant.</span>
          <button className="btn btn-primary" onClick={() => window.print()}>Imprimer</button>
        </>}>
        {badges && <BadgeSheet badges={badges} title="Examina" />}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        danger
        busy={busy}
        title="Supprimer ce candidat ?"
        confirmLabel="Supprimer"
        message={<p>Le compte de « {toDelete?.fullName} » et tous ses résultats seront supprimés.</p>}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && run(async () => { await candidates.delete(toDelete.id); setToDelete(null); await reload(); })}
      />
    </>
  );
}
