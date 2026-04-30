import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Jeep,
  Envelope,
  SpinnerGap,
  WarningCircle,
  ArrowLeft,
  ArrowRight,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { Mono, TopoBg, AuthInput } from '@/components/redesign';

const ForgotPassword = () => {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const { error } = await resetPassword(email);
    if (error) {
      setError('Unable to send recovery email, please try again.');
      setIsLoading(false);
    } else {
      setSuccess(true);
      setIsLoading(false);
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
                <Envelope className="w-6 h-6" weight="regular" />
              </div>
              <Mono className="text-pine-6">Check your email</Mono>
              <h1 className="font-sans font-bold tracking-[-0.025em] text-ink text-[26px] leading-[1.1] mt-2">
                Reset link sent.
              </h1>
              <p className="text-[14px] text-ink-3 mt-3 leading-[1.55]">
                We've sent a password reset link to
              </p>
              <p className="font-mono text-[13px] uppercase tracking-[0.06em] text-ink mt-1.5 break-all">
                {email}
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-sans font-semibold bg-ink text-cream hover:bg-ink-2 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <Mono className="text-pine-6">Forgot password</Mono>
              <h1 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] leading-[1.1] mt-2">
                Reset your password.
              </h1>
              <p className="text-[14px] text-ink-3 mt-2">
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-ember/10 border border-ember/30 rounded-[12px] text-ember text-[13px]">
                    <WarningCircle className="w-4 h-4 flex-shrink-0" weight="regular" />
                    <span>{error}</span>
                  </div>
                )}

                <AuthInput
                  id="email"
                  label="Email"
                  type="email"
                  icon={Envelope}
                  placeholder="you@example.com"
                  value={email}
                  onChange={setEmail}
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
                      Sending…
                    </>
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="w-4 h-4" weight="bold" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" weight="regular" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
