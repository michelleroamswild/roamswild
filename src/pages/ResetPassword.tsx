import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Jeep,
  Lock,
  SpinnerGap,
  WarningCircle,
  CheckCircle,
  ArrowRight,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { Mono, TopoBg, AuthInput } from '@/components/redesign';

const ResetPassword = () => {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    const { error } = await updatePassword(password);
    if (error) {
      setError(error.message);
      setIsLoading(false);
    } else {
      setSuccess(true);
      setIsLoading(false);
      setTimeout(() => navigate('/'), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-cream text-ink font-sans relative flex items-center justify-center p-6 overflow-hidden">
      <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />
      <div className="relative w-full max-w-[420px]">
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
          <Jeep className="w-6 h-6 text-pine-6" weight="regular" />
          <span className="text-[16px] font-sans font-bold tracking-[-0.01em] text-ink">
            RoamsWild
          </span>
        </Link>

        <div className="bg-white border border-line rounded-[18px] p-8 shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
          {success ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 text-pine-6 mb-4">
                <CheckCircle className="w-6 h-6" weight="fill" />
              </div>
              <Mono className="text-pine-6">All set</Mono>
              <h1 className="font-sans font-bold tracking-[-0.025em] text-ink text-[26px] leading-[1.1] mt-2">
                Password updated.
              </h1>
              <p className="text-[14px] text-ink-3 mt-3 leading-[1.55]">
                Redirecting you to the app…
              </p>
            </div>
          ) : (
            <>
              <Mono className="text-pine-6">New password</Mono>
              <h1 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] leading-[1.1] mt-2">
                Set a new password.
              </h1>
              <p className="text-[14px] text-ink-3 mt-2">
                Choose a strong password for your account.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-ember/10 border border-ember/30 rounded-[12px] text-ember text-[13px]">
                    <WarningCircle className="w-4 h-4 flex-shrink-0" weight="regular" />
                    <span>{error}</span>
                  </div>
                )}

                <AuthInput
                  id="password"
                  label="New password"
                  type="password"
                  icon={Lock}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={setPassword}
                  required
                  minLength={6}
                />

                <AuthInput
                  id="confirm-password"
                  label="Confirm new password"
                  type="password"
                  icon={Lock}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  required
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 px-5 rounded-[14px] bg-pine-6 text-cream text-[14px] font-sans font-semibold hover:bg-pine-5 transition-colors disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <SpinnerGap className="w-4 h-4 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    <>
                      Update password
                      <ArrowRight className="w-4 h-4" weight="bold" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-7 pt-6 border-t border-line text-center text-[13px] text-ink-3">
                Remember your password?{' '}
                <Link to="/login" className="font-semibold text-pine-6 hover:text-pine-5 transition-colors">
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
