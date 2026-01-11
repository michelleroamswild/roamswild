import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Compass, Users, Loader2, AlertCircle, Calendar, Route, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTrip } from '@/context/TripContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getTripUrl } from '@/utils/slugify';

interface ShareLinkInfo {
  tripId: string;
  tripName: string;
  permission: 'view' | 'edit';
  ownerName?: string;
  daysCount: number;
  totalDistance: string;
  destinations: string[];
}

const JoinTrip = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { joinTripByLink } = useTrip();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<ShareLinkInfo | null>(null);

  // Fetch share link info using security definer function
  useEffect(() => {
    const fetchLinkInfo = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        // Use the security definer function to get trip preview
        const { data, error } = await supabase
          .rpc('get_trip_preview_by_token', { share_token: token });

        if (error || !data) {
          console.error('Error fetching trip preview:', error);
          setError('Share link not found or has expired');
          setLoading(false);
          return;
        }

        const destinations = data.destinations || [];

        setLinkInfo({
          tripId: data.trip_id,
          tripName: data.trip_name || 'Untitled Trip',
          permission: data.permission as 'view' | 'edit',
          ownerName: data.owner_name || undefined,
          daysCount: data.days_count || 0,
          totalDistance: data.total_distance || '0 mi',
          destinations: destinations.slice(0, 3).map((d: any) => d.name || d),
        });
      } catch (err) {
        console.error('Error fetching link info:', err);
        setError('Failed to load share link');
      }

      setLoading(false);
    };

    fetchLinkInfo();
  }, [token]);

  const handleJoin = async () => {
    if (!token) return;

    setJoining(true);
    const result = await joinTripByLink(token);
    setJoining(false);

    if (result.error) {
      toast.error(result.error);
    } else if (result.tripId) {
      toast.success('You now have access to this trip!');
      navigate(getTripUrl(linkInfo?.tripName));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading trip details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Unable to Join Trip</h2>
              <p className="text-muted-foreground mb-6">{error}</p>
              <Link to="/">
                <Button variant="outline">Go to Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Sign In to Join Trip</CardTitle>
            <CardDescription>
              You need to be signed in to join "{linkInfo?.tripName}"
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Link to="/auth" state={{ returnTo: `/join/${token}` }}>
                <Button className="w-full">Sign In</Button>
              </Link>
              <Link to="/">
                <Button variant="outline" className="w-full">Go to Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Compass className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">{linkInfo?.tripName}</CardTitle>
          {linkInfo?.ownerName && (
            <CardDescription>Shared by {linkInfo.ownerName}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Trip Summary */}
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 bg-secondary/50 rounded-lg">
              <Calendar className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="font-semibold text-foreground">{linkInfo?.daysCount} days</p>
              <p className="text-xs text-muted-foreground">Duration</p>
            </div>
            <div className="p-3 bg-secondary/50 rounded-lg">
              <Route className="w-5 h-5 text-terracotta mx-auto mb-1" />
              <p className="font-semibold text-foreground">{linkInfo?.totalDistance}</p>
              <p className="text-xs text-muted-foreground">Total Distance</p>
            </div>
          </div>

          {/* Destinations */}
          {linkInfo?.destinations && linkInfo.destinations.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Destinations</p>
              <div className="flex flex-wrap gap-2">
                {linkInfo.destinations.map((dest, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-secondary/50 rounded-full text-xs text-muted-foreground"
                  >
                    <MapPin className="w-3 h-3" />
                    {dest}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Permission Badge */}
          <div className="flex items-center justify-center gap-2 p-3 bg-primary/5 rounded-lg">
            <span className="text-sm text-muted-foreground">You'll have</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              linkInfo?.permission === 'edit'
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-blue-500/10 text-blue-600'
            }`}>
              {linkInfo?.permission === 'edit' ? 'Edit Access' : 'View Only'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 mr-2" />
                  Join This Trip
                </>
              )}
            </Button>
            <Link to="/">
              <Button variant="outline" className="w-full">
                Maybe Later
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinTrip;
