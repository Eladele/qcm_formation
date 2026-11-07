import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AppUser, UserRole } from '../../application';
import { useServices } from '../di/container';
import { Spinner } from '../components/ui';

interface AuthState {
  readonly user: AppUser | null;
  readonly loading: boolean;
  signIn(email: string, password: string): Promise<AppUser>;
  signInWithQr(token: string): Promise<AppUser>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = useServices();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await auth.currentUser());
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void refresh();
    return auth.onAuthChange(() => void refresh());
  }, [auth, refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        const u = await auth.signIn(email, password);
        setUser(u);
        return u;
      },
      signInWithQr: async (token) => {
        const u = await auth.signInWithQrToken(token);
        setUser(u);
        return u;
      },
      signOut: async () => {
        await auth.signOut();
        setUser(null);
      },
    }),
    [auth, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé sous <AuthProvider>');
  return ctx;
}

/** Garde de route : authentification + rôle. */
export function RequireAuth({ role, children }: { role?: UserRole; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner full />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}
