import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SpinnerGap } from '@phosphor-icons/react';

interface EmailGateProps {
  allowedEmails: string[];
  children: ReactNode;
  redirectTo?: string;
}

export function EmailGate({ allowedEmails, children, redirectTo = '/404' }: EmailGateProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <SpinnerGap className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const email = user?.email?.toLowerCase();
  const allowed = email && allowedEmails.map((e) => e.toLowerCase()).includes(email);

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
