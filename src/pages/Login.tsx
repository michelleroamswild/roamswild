import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Jeep,
  Envelope,
  Lock,
  SpinnerGap,
  WarningCircle,
  ArrowRight,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { Mono, TopoBg, AuthSidePanel, AuthInput } from '@/components/redesign';

import heroPhoto from '@/images/landingpage/DJI_0792.jpg';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError('Unable to sign in, please check your email and password.');
      setIsLoading(false);
    } else {
      navigate(from, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-cream dark:bg-paper text-ink font-sans flex">
      <AuthSidePanel
        photo={heroPhoto}
        headline={<>Your next adventure<br />starts here.</>}
      />

      {/* Right side — form */}
      <div className="flex-1 relative flex items-center justify-center p-6 md:p-12 overflow-hidden">
        <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />
        <div className="relative w-full max-w-[420px]">
          {/* Mobile logo */}
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
            <Jeep className="w-6 h-6 text-pine-6" weight="regular" />
            <span className="text-[16px] font-sans font-bold tracking-[-0.01em] text-ink">
              RoamsWild
            </span>
          </Link>

          <div className="bg-white dark:bg-paper-2 border border-line rounded-[18px] p-8 shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
            <Mono className="text-pine-6">Welcome back</Mono>
            <h1 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] leading-[1.1] mt-2">
              Sign in to your account.
            </h1>
            <p className="text-[14px] text-ink-3 mt-2">
              Continue planning your adventure.
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

              <AuthInput
                id="password"
                label="Password"
                type="password"
                icon={Lock}
                placeholder="Enter your password"
                value={password}
                onChange={setPassword}
                required
                rightSlot={
                  <Link
                    to="/forgot-password"
                    className="text-[12px] font-mono uppercase tracking-[0.10em] text-pine-6 hover:text-pine-5 transition-colors"
                  >
                    Forgot?
                  </Link>
                }
              />

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 h-12 px-5 rounded-[14px] bg-pine-6 text-cream dark:text-ink-pine text-[14px] font-sans font-semibold hover:bg-pine-5 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <SpinnerGap className="w-4 h-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" weight="bold" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 pt-6 border-t border-line text-center text-[13px] text-ink-3">
              Don't have an account?{' '}
              <Link to="/signup" className="font-semibold text-pine-6 hover:text-pine-5 transition-colors">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
