import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Jeep,
  Envelope,
  Lock,
  User,
  SpinnerGap,
  WarningCircle,
  Ticket,
  ArrowRight,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Mono, TopoBg, AuthSidePanel, AuthInput } from '@/components/redesign';

import heroPhoto from '@/images/landingpage/DJI_0682.jpg';

const Signup = () => {
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailError(null);
    setInviteError(null);

    if (!inviteCode.trim()) {
      setInviteError('Invite code is required');
      return;
    }
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    const { data: codeCheck, error: codeError } = await supabase
      .rpc('check_invite_code', { code: inviteCode.trim().toUpperCase() });

    if (codeError || !codeCheck?.[0]?.valid) {
      setInviteError('Invalid or already used invite code');
      setIsLoading(false);
      return;
    }

    const { error: signUpError, data } = await signUp(email, password, name);

    if (signUpError) {
      const msg = signUpError.message?.toLowerCase() || '';
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        setEmailError('An account with this email already exists');
      } else {
        setError('Unable to create account, please try again.');
      }
      setIsLoading(false);
    } else {
      if (data?.user?.id) {
        await supabase.rpc('use_invite_code', {
          code: inviteCode.trim().toUpperCase(),
          user_id: data.user.id,
        });
      }
      setSuccess(true);
      setIsLoading(false);
    }
  };

  // === Success state — full-screen confirmation card ===
  if (success) {
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

          <div className="bg-white border border-line rounded-[18px] p-8 text-center shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 text-pine-6 mb-4">
              <Envelope className="w-6 h-6" weight="regular" />
            </div>
            <Mono className="text-pine-6">Almost there</Mono>
            <h1 className="font-sans font-bold tracking-[-0.025em] text-ink text-[26px] leading-[1.1] mt-2">
              Check your email.
            </h1>
            <p className="text-[14px] text-ink-3 mt-2">
              We've sent a confirmation link to
            </p>
            <p className="font-mono text-[13px] uppercase tracking-[0.06em] text-ink mt-2 break-all">
              {email}
            </p>
            <p className="text-[13px] text-ink-3 mt-4 leading-[1.55]">
              Click the link in the email to verify your account and start planning your adventures.
            </p>

            <div className="mt-6 pt-6 border-t border-line space-y-3">
              <p className="text-[13px] text-ink-3">
                Didn't receive the email?{' '}
                <button
                  onClick={() => setSuccess(false)}
                  className="font-semibold text-pine-6 hover:text-pine-5 transition-colors"
                >
                  Try again
                </button>
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-sans font-semibold bg-ink text-cream hover:bg-ink-2 transition-colors"
              >
                Go to sign in
                <ArrowRight className="w-3.5 h-3.5" weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-ink font-sans flex">
      <AuthSidePanel
        photo={heroPhoto}
        headline={<>Start planning your<br />next adventure.</>}
      />

      {/* Right side — form */}
      <div className="flex-1 relative flex items-center justify-center p-6 md:p-12 overflow-hidden">
        <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />
        <div className="relative w-full max-w-[420px]">
          <Link to="/" className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
            <Jeep className="w-6 h-6 text-pine-6" weight="regular" />
            <span className="text-[16px] font-sans font-bold tracking-[-0.01em] text-ink">
              RoamsWild
            </span>
          </Link>

          <div className="bg-white border border-line rounded-[18px] p-8 shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
            <Mono className="text-pine-6">Create account</Mono>
            <h1 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] leading-[1.1] mt-2">
              Get started.
            </h1>
            <p className="text-[14px] text-ink-3 mt-2">
              Plan your next trip with RoamsWild.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-ember/10 border border-ember/30 rounded-[12px] text-ember text-[13px]">
                  <WarningCircle className="w-4 h-4 flex-shrink-0" weight="regular" />
                  <span>{error}</span>
                </div>
              )}

              <AuthInput
                id="invite-code"
                label="Invite code"
                type="text"
                icon={Ticket}
                placeholder="ROAM-XXXXXX"
                value={inviteCode}
                onChange={(v) => {
                  setInviteCode(v.toUpperCase());
                  if (inviteError) setInviteError(null);
                }}
                required
                error={inviteError}
                uppercase
              />
              {!inviteError && (
                <p className="-mt-2 text-[12px] font-mono uppercase tracking-[0.10em] text-ink-3">
                  No code?{' '}
                  <Link to="/" className="text-pine-6 hover:text-pine-5 transition-colors">
                    Join the waitlist
                  </Link>
                </p>
              )}

              <AuthInput
                id="name"
                label="Name"
                type="text"
                icon={User}
                placeholder="Your name"
                value={name}
                onChange={setName}
              />

              <AuthInput
                id="email"
                label="Email"
                type="email"
                icon={Envelope}
                placeholder="you@example.com"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError(null);
                }}
                onBlur={() => {
                  if (email && !validateEmail(email)) setEmailError('Please enter a valid email address');
                }}
                error={emailError}
              />

              <AuthInput
                id="password"
                label="Password"
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
                label="Confirm password"
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
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="w-4 h-4" weight="bold" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 pt-6 border-t border-line text-center text-[13px] text-ink-3">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-pine-6 hover:text-pine-5 transition-colors">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
