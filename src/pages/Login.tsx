import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Jeep, Envelope, Lock, SpinnerGap, WarningCircle, Mountains, Tent, Path } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

// Import a landing page photo for the side panel
import heroPhoto from '@/images/landingpage/DJI_0792.jpg';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get the page they were trying to visit
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
              Your next adventure<br />starts here.
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

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 hero-topo">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link to="/" className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <Jeep className="w-8 h-8 text-primary" weight="fill" />
            <span className="text-2xl font-display font-bold text-foreground">RoamsWild</span>
          </Link>

          <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-display font-bold text-foreground">Welcome back</h1>
              <p className="text-muted-foreground mt-2">Sign in to continue your adventure</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
                  <WarningCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
                <div className="relative">
                  <Envelope className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary hover:underline font-medium"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-8 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary font-semibold hover:underline">
                Sign up for free
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
