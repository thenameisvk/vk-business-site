import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/Authcontext';
import { LOGIN_PATH } from '../api';

export const ADMIN_HOME = '/admin';
export const USER_HOME = '/user';

/* <Route element={<ProtectedRoute role="admin" />}> …child routes… </Route>
   or <ProtectedRoute role="user"><Home /></ProtectedRoute>                    */
export default function ProtectedRoute({ role, children }) {
  const { session, checking } = useAuth();
  const location = useLocation();

  if (checking) {
    return (
      <div role="status" aria-live="polite" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0a0b', color: '#bfb6b8', fontFamily: 'system-ui, sans-serif' }}>
        Checking your session…
      </div>
    );
  }
  if (!session) return <Navigate to={LOGIN_PATH} replace state={{ from: location }} />;
  if (role && session.role !== role) return <Navigate to={session.role === 'admin' ? ADMIN_HOME : USER_HOME} replace />;
  return children ?? <Outlet />;
}