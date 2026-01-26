import { ClockCounterClockwise, MapPin, ArrowRight, SpinnerGap } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useRecentSearches } from '@/hooks/use-recent-searches';

export function RecentSearchesWidget() {
  const { recentSearches, loading } = useRecentSearches();

  // Show only the most recent search
  const mostRecent = recentSearches[0];

  // Don't render if loading or no recent searches
  if (loading) {
    return (
      <div className="bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-4 border border-border/50 min-w-[340px] max-w-[380px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <SpinnerGap className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading searches...</span>
        </div>
      </div>
    );
  }

  if (!mostRecent) {
    return null;
  }

  return (
    <div className="bg-white/95 dark:bg-card/95 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-4 border border-border/50 min-w-[340px] max-w-[380px]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <ClockCounterClockwise className="w-3.5 h-3.5" weight="fill" />
        <span className="font-medium">Recent searches</span>
      </div>

      <Link
        to={`/location/${mostRecent.placeId}`}
        state={{
          placeId: mostRecent.placeId,
          name: mostRecent.name,
          address: mostRecent.address,
          lat: mostRecent.lat,
          lng: mostRecent.lng,
        }}
        className="flex items-center gap-2 group"
      >
        <MapPin className="w-5 h-5 text-primary dark:text-primary/80" weight="fill" />
        <div>
          <p className="text-xs text-muted-foreground">Last searched</p>
          <p className="text-base font-bold text-foreground leading-tight group-hover:text-primary transition-colors truncate max-w-[180px]">
            {mostRecent.name}
          </p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" weight="bold" />
      </Link>
    </div>
  );
}
