import { MapPin, Tent, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import type { Campsite } from '@/types/campsite';

interface FloatingUserCampsiteDetailCardProps {
  campsite: Campsite;
  onClose: () => void;
}

export const FloatingUserCampsiteDetailCard = ({
  campsite,
  onClose,
}: FloatingUserCampsiteDetailCardProps) => {
  return (
    <div className="absolute top-3 right-3 w-80 bg-background border border-border rounded-xl shadow-2xl z-20">
      <div className="px-3 py-2.5 flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Tent className="w-4 h-4 text-wildviolet shrink-0" />
            <h3 className="font-bold text-sm truncate">{campsite.name}</h3>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium mt-1 inline-block">{campsite.campsiteType || 'Campsite'}</span>
        </div>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-3 pb-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">{campsite.lat.toFixed(5)}, {campsite.lng.toFixed(5)}</span>
          <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`, '_blank')} className="text-muted-foreground hover:text-foreground transition-colors" title="Open in Google Maps">
            <MapPin className="w-3.5 h-3.5" weight="fill" />
          </button>
        </div>
        <Button variant="outline" size="sm" className="w-full text-[10px] h-7" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${campsite.lat},${campsite.lng}`, '_blank')}>Google Maps</Button>
      </div>
    </div>
  );
};
