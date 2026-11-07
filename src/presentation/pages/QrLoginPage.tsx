import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QrLoginLink } from '../../domain';
import { useAuth } from '../auth/AuthContext';
import { Alert, Spinner } from '../components/ui';
import { messageFor } from '../i18n/errorMessages';

/** Page ouverte par le scan du QR : /qr#t=<jeton> */
export function QrLoginPage() {
  const { signInWithQr } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // StrictMode exécute les effets deux fois en dev

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = QrLoginLink.parse(window.location.hash);
    // On efface le jeton de la barre d'adresse et de l'historique immédiatement
    window.history.replaceState(null, '', QrLoginLink.PATH);
    if (!token) {
      setError(messageFor(new Error('QR code invalide.')));
      return;
    }
    signInWithQr(token)
      .then(() => navigate('/', { replace: true }))
      .catch((e) => setError(messageFor(e)));
  }, [signInWithQr, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="brand brand-lg"><span className="brand-mark">E</span> Examina</div>
        {error ? (
          <>
            <Alert>{error}</Alert>
            <Link to="/login" className="btn btn-ghost">Retour</Link>
          </>
        ) : (
          <Spinner label="Connexion en cours…" />
        )}
      </div>
    </div>
  );
}
