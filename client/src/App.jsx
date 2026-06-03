import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
            An unexpected error occurred. Reload the page to continue.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import OnboardingPage from './pages/OnboardingPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import ProgressPage from './pages/ProgressPage';
import LibraryPage from './pages/LibraryPage';
import ChatHistoryPage from './pages/ChatHistoryPage';
import AppLayout from './components/shared/AppLayout';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

// Protects the onboarding route: redirects to / if onboarding is already done
// so a completed user can never reach the onboarding page (and trigger 401s).
function OnboardingRoute({ children }) {
  const { user, onboardingComplete, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (onboardingComplete) return <Navigate to="/" replace />;
  return children;
}

function OnboardingGuard({ children }) {
  const { user, onboardingComplete, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;
  return children;
}

function FullScreenLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={
            <OnboardingRoute><OnboardingPage /></OnboardingRoute>
          } />
          <Route path="/" element={
            <OnboardingGuard>
              <AppLayout><ChatPage /></AppLayout>
            </OnboardingGuard>
          } />
          <Route path="/settings" element={
            <OnboardingGuard>
              <AppLayout><SettingsPage /></AppLayout>
            </OnboardingGuard>
          } />
          <Route path="/progress" element={
            <OnboardingGuard>
              <AppLayout><ProgressPage /></AppLayout>
            </OnboardingGuard>
          } />
          <Route path="/history" element={
            <OnboardingGuard>
              <AppLayout><ChatHistoryPage /></AppLayout>
            </OnboardingGuard>
          } />
          <Route path="/library" element={
            <OnboardingGuard>
              <AppLayout><LibraryPage /></AppLayout>
            </OnboardingGuard>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}
