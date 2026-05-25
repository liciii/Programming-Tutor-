import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/onboarding" element={
            <ProtectedRoute><OnboardingPage /></ProtectedRoute>
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
  );
}
