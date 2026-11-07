import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to={user?.role === 'admin' ? '/admin' : '/'} className="brand">
          <span className="brand-mark">E</span> Examina
        </NavLink>
        {user && (
          <nav className="topnav">
            {user.role === 'admin' ? (
              <>
                <NavLink to="/admin" end>Tableau de bord</NavLink>
                <NavLink to="/admin/candidates">Candidats</NavLink>
              </>
            ) : (
              <NavLink to="/" end>Mes tests</NavLink>
            )}
          </nav>
        )}
        {user && (
          <div className="userbox">
            <span className="avatar" aria-hidden>{user.fullName.slice(0, 1).toUpperCase()}</span>
            <span className="user-name">
              {user.fullName}
              <small>{user.role === 'admin' ? 'Administrateur' : 'Candidat'}</small>
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              Déconnexion
            </button>
          </div>
        )}
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
