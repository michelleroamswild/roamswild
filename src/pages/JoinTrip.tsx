import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Compass,
  Users,
  SpinnerGap,
  WarningCircle,
  Calendar,
  Path,
  MapPin,
  ArrowRight,
} from '@phosphor-icons/react';
import { useTrip } from '@/context/TripContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getTripUrl } from '@/utils/slugify';
import { Mono, Pill, TopoBg } from '@/components/redesign';

interface ShareLinkInfo {
  tripId: string;
  tripName: string;
  permission: 'view' | 'edit';
  ownerName?: string;
  daysCount: number;
  totalDistance: string;
  destinations: string[];
}

// Shell wrapper — every state (loading / error / sign-in / accept) renders
// inside the same cream-with-topo backdrop and centered card so transitions
// between states feel continuous.
const JoinShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-cream dark:bg-paper text-ink font-sans relative flex items-center justify-center p-6 overflow-hidden">
    <TopoBg color="hsl(var(--paper))" opacity={0.55} scale={700} />
    <div className="relative w-full max-w-[440px]">{children}</div>
  </div>
);

const JoinTrip = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { joinTripByLink, loadSavedTrip } = useTrip();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkInfo, setLinkInfo] = useState<ShareLinkInfo | null>(null);

  // Fetch share link info via security-definer RPC.
  useEffect(() => {
    const fetchLinkInfo = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const { data: rawData, error } = await supabase.rpc('get_trip_preview_by_token', {
          share_token: token,
        });

        // RPC returns a Json blob; widen via typed cast rather than `as any`.
        const data = rawData as
          | {
              trip_id?: string;
              trip_name?: string;
              permission?: 'view' | 'edit';
              owner_name?: string;
              days_count?: number;
              total_distance?: string;
              destinations?: Array<{ name?: string } | string>;
            }
          | null;

        if (error || !data) {
          console.error('Error fetching trip preview:', error);
          setError('Share link not found or has expired');
          setLoading(false);
          return;
        }

        const destinations = data.destinations || [];
        setLinkInfo({
          tripId: data.trip_id || '',
          tripName: data.trip_name || 'Untitled trip',
          permission: data.permission || 'view',
          ownerName: data.owner_name || undefined,
          daysCount: data.days_count || 0,
          totalDistance: data.total_distance || '0 mi',
          destinations: destinations.slice(0, 3).map((d) => (typeof d === 'string' ? d : d.name || '')),
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
      toast.success('You now have access to this trip');
      loadSavedTrip(result.tripId);
      navigate(getTripUrl(linkInfo?.tripName));
    }
  };

  // === Loading state ===
  if (loading) {
    return (
      <JoinShell>
        <div className="bg-white dark:bg-paper-2 border border-line rounded-[18px] p-10 text-center shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 mb-4">
            <SpinnerGap className="w-6 h-6 text-pine-6 animate-spin" />
          </div>
          <Mono className="text-pine-6">Loading trip</Mono>
          <p className="text-[14px] text-ink-3 mt-2">Pulling trip details…</p>
        </div>
      </JoinShell>
    );
  }

  // === Error state ===
  if (error) {
    return (
      <JoinShell>
        <div className="bg-white dark:bg-paper-2 border border-line rounded-[18px] p-8 text-center shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-ember/15 text-ember mb-4">
            <WarningCircle className="w-6 h-6" weight="regular" />
          </div>
          <Mono className="text-ember">Unable to join</Mono>
          <h1 className="text-[24px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-2">
            This share link doesn't work.
          </h1>
          <p className="text-[14px] text-ink-3 mt-3 leading-[1.55]">{error}</p>
          <div className="mt-6 flex justify-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-line bg-white dark:bg-paper-2 text-ink text-[14px] font-sans font-semibold hover:border-ink-3 transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </JoinShell>
    );
  }

  // === Sign-in required state ===
  if (!user) {
    return (
      <JoinShell>
        <div className="bg-white dark:bg-paper-2 border border-line rounded-[18px] p-8 text-center shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 text-pine-6 mb-4">
            <Users className="w-6 h-6" weight="regular" />
          </div>
          <Mono className="text-pine-6">Sign in to join</Mono>
          <h1 className="text-[24px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-2">
            "{linkInfo?.tripName}"
          </h1>
          <p className="text-[14px] text-ink-3 mt-3 leading-[1.55]">
            You need a RoamsWild account to join this trip.
          </p>
          <div className="mt-6 space-y-2">
            <Link
              to="/login"
              state={{ returnTo: `/join/${token}` }}
              className="inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 rounded-[14px] bg-pine-6 text-cream dark:text-ink-pine text-[14px] font-sans font-semibold hover:bg-pine-5 transition-colors"
            >
              Sign in
              <ArrowRight className="w-4 h-4" weight="bold" />
            </Link>
            <Link
              to="/"
              className="inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 rounded-[14px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] font-sans font-semibold hover:border-ink-3 transition-colors"
            >
              Go home
            </Link>
          </div>
        </div>
      </JoinShell>
    );
  }

  // === Trip preview / accept state ===
  return (
    <JoinShell>
      <div className="bg-white dark:bg-paper-2 border border-line rounded-[18px] p-8 shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-pine-6/10 text-pine-6 mb-4">
            <Compass className="w-6 h-6" weight="regular" />
          </div>
          <Mono className="text-pine-6">Trip invitation</Mono>
          <h1 className="text-[26px] font-sans font-bold tracking-[-0.025em] text-ink leading-[1.1] mt-2">
            {linkInfo?.tripName}
          </h1>
          {linkInfo?.ownerName && (
            <p className="text-[13px] text-ink-3 mt-2">Shared by {linkInfo.ownerName}</p>
          )}
        </div>

        {/* Trip summary — 2 stat tiles */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="px-3 py-3 rounded-[12px] border border-line bg-cream dark:bg-paper-2 text-center">
            <Calendar className="w-4 h-4 text-pine-6 mx-auto" weight="regular" />
            <p className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink mt-1.5">
              {linkInfo?.daysCount} {linkInfo?.daysCount === 1 ? 'day' : 'days'}
            </p>
            <Mono className="text-ink-3 block mt-0.5">Duration</Mono>
          </div>
          <div className="px-3 py-3 rounded-[12px] border border-line bg-cream dark:bg-paper-2 text-center">
            <Path className="w-4 h-4 text-clay mx-auto" weight="regular" />
            <p className="text-[18px] font-sans font-bold tracking-[-0.015em] text-ink mt-1.5">
              {linkInfo?.totalDistance}
            </p>
            <Mono className="text-ink-3 block mt-0.5">Distance</Mono>
          </div>
        </div>

        {/* Destinations */}
        {linkInfo?.destinations && linkInfo.destinations.length > 0 && (
          <div className="mt-5">
            <Mono className="text-ink-2 block mb-2">Destinations</Mono>
            <div className="flex flex-wrap gap-1.5">
              {linkInfo.destinations.map((dest, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cream dark:bg-paper-2 border border-line text-[12px] font-sans font-semibold text-ink"
                >
                  <MapPin className="w-3 h-3 text-pine-6" weight="regular" />
                  {dest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Permission badge */}
        <div className="mt-5 flex items-center justify-center gap-2 px-3 py-2.5 rounded-[12px] border border-line bg-cream dark:bg-paper-2">
          <Mono className="text-ink-3">You'll have</Mono>
          <span
            className={
              linkInfo?.permission === 'edit'
                ? 'inline-flex items-center px-2 py-0.5 rounded-full border border-pine-6/40 bg-pine-6/10 text-pine-6 text-[10px] font-mono font-semibold uppercase tracking-[0.10em]'
                : 'inline-flex items-center px-2 py-0.5 rounded-full border border-water/40 bg-water/15 text-water text-[10px] font-mono font-semibold uppercase tracking-[0.10em]'
            }
          >
            {linkInfo?.permission === 'edit' ? 'Edit access' : 'View only'}
          </span>
        </div>

        {/* Action pills */}
        <div className="mt-6 space-y-2">
          <Pill
            variant="solid-pine"
            mono={false}
            onClick={handleJoin}
            className={`!w-full !justify-center ${joining ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {joining ? (
              <>
                <SpinnerGap className="w-4 h-4 animate-spin" />
                Joining…
              </>
            ) : (
              <>
                <Users className="w-4 h-4" weight="regular" />
                Join this trip
              </>
            )}
          </Pill>
          <Link
            to="/"
            className="inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 rounded-[14px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] font-sans font-semibold hover:border-ink-3 transition-colors"
          >
            Maybe later
          </Link>
        </div>
      </div>
    </JoinShell>
  );
};

export default JoinTrip;
