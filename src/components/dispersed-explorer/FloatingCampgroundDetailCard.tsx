import { MapPin, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { EstablishedCampground } from '@/hooks/use-dispersed-roads';

interface FloatingCampgroundDetailCardProps {
  campground: EstablishedCampground;
  onClose: () => void;
}

export const FloatingCampgroundDetailCard = ({
  campground,
  onClose,
}: FloatingCampgroundDetailCardProps) => {
  return (
    <div className="absolute top-3 right-3 w-80 bg-background border border-border rounded-xl shadow-2xl z-20">
      <div className="px-3 py-2.5 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm truncate">{campground.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-medium">{campground.facilityType}</span>
            {campground.agencyName && <span className="text-xs text-muted-foreground">{campground.agencyName}</span>}
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-3 pb-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">{campground.lat.toFixed(5)}, {campground.lng.toFixed(5)}</span>
          <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${campground.lat},${campground.lng}`, '_blank')} className="text-muted-foreground hover:text-foreground transition-colors" title="Open in Google Maps">
            <MapPin className="w-3.5 h-3.5" weight="fill" />
          </button>
        </div>
        {campground.reservable && campground.url && (
          <Button variant="default" size="sm" className="w-full text-[10px] h-7 cursor-pointer" onClick={() => window.open(campground.url, '_blank')}>Reserve</Button>
        )}
      </div>
    </div>
  );
};
