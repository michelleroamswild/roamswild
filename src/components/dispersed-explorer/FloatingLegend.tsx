import { Eye, EyeSlash, MapTrifold, Tent } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface FloatingLegendProps {
  showPublicLands: boolean;
  onTogglePublicLands: () => void;
}

export const FloatingLegend = ({
  showPublicLands,
  onTogglePublicLands,
}: FloatingLegendProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="absolute bottom-4 left-4 z-10 w-12 h-12 rounded-full bg-background border border-border shadow-lg flex items-center justify-center hover:bg-secondary transition-colors"
          aria-label="Show legend"
        >
          <MapTrifold className="w-5 h-5 text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-4"
        sideOffset={8}
      >
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MapTrifold className="w-4 h-4" />
            Map Legend
          </h3>

          {/* Land Overlays */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Land Overlays</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={onTogglePublicLands}
              >
                {showPublicLands ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeSlash className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-600 rounded" />
                <span>USFS</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500/30 border border-amber-600 rounded" />
                <span>BLM</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-violet-500/30 border border-violet-600 rounded" />
                <span>NPS</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500/30 border border-blue-600 rounded" />
                <span>State Park</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500/30 border border-cyan-600 rounded" />
                <span>State Trust</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-pink-500/30 border border-pink-600 rounded" />
                <span>Land Trust</span>
              </div>
            </div>
          </div>

          {/* Spot Markers */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Spot Markers</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3d7a40' }} />
                <span>Known Campsite</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#eab308' }} />
                <span>High Confidence</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f97316' }} />
                <span>Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <span>Campground</span>
              </div>
              <div className="flex items-center gap-2">
                <Tent className="w-3 h-3 text-wildviolet" weight="fill" />
                <span>My Campsite</span>
              </div>
            </div>
          </div>

          {/* Road Colors */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Road Access</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-blue-500 rounded" />
                <span>Paved</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-green-500 rounded" />
                <span>Passenger</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-orange-500 rounded" />
                <span>High Clearance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-red-500 rounded" />
                <span>4WD</span>
              </div>
            </div>
          </div>

        </div>
      </PopoverContent>
    </Popover>
  );
};
