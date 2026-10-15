
import React from 'react';
import { Outlet } from 'react-router-dom';
import UserHeader from '../components/UserHeader';
import Footer from '../components/Footer'

export default function UserLayout() {
  // Temporary default: show Login until authentication
  // state is connected to your actual auth context.
  const isAuthenticated = false;

  const handleLogin = () => {
    // NavLink already navigates to /login.
  };

  const handleLogout = async () => {
    // TODO: Connect your actual logout function here.
    // Clear the authentication token/session and auth state.
    console.warn('Connect handleLogout to your auth context.');
  };

  return (
    <>
      <UserHeader
        isAuthenticated={isAuthenticated}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />

      <main style={{marginTop:'70px'}}>
        <Outlet />
      </main>
      <Footer/>
    </>
  );
}
