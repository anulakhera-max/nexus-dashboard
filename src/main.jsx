import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import LoginScreen, { loadSession, clearSession, saveSession } from './Login.jsx'

// Make React available globally so Login.jsx can use window.React
window.React = React;

function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check for existing session on load
    const saved = loadSession();
    if (saved) setUser(saved);
    setChecking(false);
  }, []);

  const handleLogin = (u) => {
    saveSession(u);
    setUser(u);
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  if (checking) return null; // Prevent flash
  if (!user) return <LoginScreen onLogin={handleLogin} />;
  return <App user={user} onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
