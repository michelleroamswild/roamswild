import { MapTrifold, Tent } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface FloatingLegendProps {
  visibleLandAgencies: Set<string>;
  onToggleLandAgency: (key: string) => void;
}

const LAND_AGENCIES: { key: string; label: string; fill: string; stroke: string }[] = [
  { key: 'USFS',        label: 'USFS',        fill: 'bg-emerald-500/30', stroke: 'border-emerald-600' },
  { key: 'BLM',         label: 'BLM',         fill: 'bg-amber-500/30',   stroke: 'border-amber-600' },
  { key: 'NPS',         label: 'NPS',         fill: 'bg-violet-500/30',  stroke: 'border-violet-600' },
  { key: 'STATE_PARK',  label: 'State Park',  fill: 'bg-blue-500/30',    stroke: 'border-blue-600' },
  { key: 'STATE_TRUST', label: 'State Trust', fill: 'bg-cyan-500/30',    stroke: 'border-cyan-600' },
  { key: 'LAND_TRUST',  label: 'Land Trust',  fill: 'bg-pink-500/30',    stroke: 'border-pink-600' },
];

export const FloatingLegend = ({
  visibleLandAgencies,
  onToggleLandAgency,
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

          {/* Land Overlays — one toggle per agency, off by default */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Land Overlays</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {LAND_AGENCIES.map((a) => {
                const on = visibleLandAgencies.has(a.key);
                return (
                  <button
                    key={a.key}
                    onClick={() => onToggleLandAgency(a.key)}
                    className={`flex items-center gap-2 px-1.5 py-1 rounded transition-colors text-left ${
                      on ? 'bg-secondary' : 'opacity-50 hover:opacity-100 hover:bg-secondary/50'
                    }`}
                    aria-pressed={on}
                  >
                    <div className={`w-3 h-3 rounded border ${a.fill} ${a.stroke}`} />
                    <span className="flex-1">{a.label}</span>
                  </button>
                );
              })}
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
                <span>Easy Access</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f97316' }} />
                <span>Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-black" />
                <span>Hard / Extreme</span>
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
