import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SpinnerGap } from '@phosphor-icons/react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream dark:bg-paper flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine-6/10">
            <SpinnerGap className="w-5 h-5 text-pine-6 animate-spin" />
          </div>
          <p className="text-[12px] font-mono font-semibold uppercase tracking-[0.12em] text-pine-6">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login, but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
