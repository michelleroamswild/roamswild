import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Jeep, Envelope, Lock, User, SpinnerGap, WarningCircle, CheckCircle, Mountains, Tent, Path } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

// Import a landing page photo for the side panel
import heroPhoto from '@/images/landingpage/DJI_0682.jpg';

const Signup = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailError(null);

    // Validate email
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(email, password, name);

    if (error) {
      setError('Unable to create account, please try again.');
      setIsLoading(false);
    } else {
      setSuccess(true);
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen hero-topo flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <Jeep className="w-8 h-8 text-primary" weight="fill" />
            <span className="text-2xl font-display font-bold text-foreground">RoamsWild</span>
          </div>

          <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
            <div className="text-center">
              <div className="flex items-center justify-center w-16 h-16 bg-accent/20 rounded-full mx-auto mb-4">
                <Envelope className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground">Check your email</h1>
              <p className="text-muted-foreground mt-2">
                We've sent a confirmation link to
              </p>
              <p className="font-medium text-foreground mt-1">{email}</p>
              <p className="text-muted-foreground mt-4 text-sm">
                Click the link in the email to verify your account and start planning your adventures.
              </p>
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Didn't receive the email?{' '}
                  <button
                    onClick={() => setSuccess(false)}
                    className="text-primary font-semibold hover:underline"
                  >
                    Try again
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Photo (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          src={heroPhoto}
          alt="Overlanding adventure"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/60 to-transparent" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-2">
            <Jeep className="w-8 h-8" weight="fill" />
            <span className="text-2xl font-display font-bold">RoamsWild</span>
          </Link>

          <div className="space-y-6">
            <h2 className="text-4xl font-display font-bold leading-tight">
              Start planning your<br />next adventure.
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Path className="w-5 h-5" />
                </div>
                <span className="text-lg">Plan scenic routes</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Tent className="w-5 h-5" />
                </div>
                <span className="text-lg">Discover hidden campsites</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Mountains className="w-5 h-5" />
                </div>
                <span className="text-lg">Find amazing hikes</span>
              </div>
            </div>
          </div>

          <p className="text-white/70 text-sm">
            Join thousands of adventurers planning their trips with RoamsWild.
          </p>
        </div>
      </div>

      {/* Right side - Signup form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 hero-topo">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link to="/" className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <Jeep className="w-8 h-8 text-primary" weight="fill" />
            <span className="text-2xl font-display font-bold text-foreground">RoamsWild</span>
          </Link>

          <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-display font-bold text-foreground">Create your account</h1>
              <p className="text-muted-foreground mt-2">Start planning your next adventure</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
                  <WarningCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground font-medium">Name</Label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-12"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
                <div className="relative">
                  <Envelope className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    onBlur={() => {
                      if (email && !validateEmail(email)) {
                        setEmailError('Please enter a valid email address');
                      }
                    }}
                    className={`pl-12 ${emailError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  />
                </div>
                {emailError && (
                  <p className="text-sm text-destructive">{emailError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-foreground font-medium">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-12"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <SpinnerGap className="w-5 h-5 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            <div className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary font-semibold hover:underline">
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
