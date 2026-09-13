import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { UIProvider } from './context/UIContext';
import { GlobalOrderNotifier } from './components/GlobalOrderNotifier';
import { SessionTimeout } from './components/SessionTimeout';
import { AppRouter } from './routes/AppRouter';
import { WhatsAppFloatingButton } from './components/WhatsAppFloatingButton';

export default function App() {
  return (
    <UIProvider>
      <ToastProvider>
        <AuthProvider>
          <GlobalOrderNotifier />
          <SessionTimeout />
          <Router>
            <WhatsAppFloatingButton />
            <AppRouter />
          </Router>
        </AuthProvider>
      </ToastProvider>
    </UIProvider>
  );
}
