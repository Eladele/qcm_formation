import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui';
import { messageFor } from '../i18n/errorMessages';

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showAdmin, setShowAdmin] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  const from = (location.state as { from?: string } | null)?.from;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await signIn(form.email, form.password);
      navigate(from ?? (u.role === 'admin' ? '/admin' : '/'), { replace: true });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="brand brand-lg"><span className="brand-mark">E</span> Examina</div>

        <div className="qr-help">
          <div className="qr-help-icon" aria-hidden>▣</div>
          <h2>Candidat</h2>
          <p>Ouvrez l'<strong>appareil photo</strong> de votre téléphone et scannez le <strong>QR code de votre badge</strong>. Vous serez connecté automatiquement.</p>
        </div>

        {!showAdmin ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAdmin(true)}>Espace administrateur</button>
        ) : (
          <form className="stack" onSubmit={submit}>
            <h2 className="section-title">Administrateur</h2>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input id="password" type="password" required autoComplete="current-password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            {error && <Alert>{error}</Alert>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Patientez…' : 'Se connecter'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
