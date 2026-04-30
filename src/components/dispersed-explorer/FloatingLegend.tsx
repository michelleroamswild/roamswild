import { MapTrifold, Tent } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface FloatingLegendProps {
  visibleLandAgencies: Set<string>;
  onToggleLandAgency: (key: string) => void;
}

// Land overlay agencies, mapped to the redesign land-* tokens (each has a
// fill color + a darker stroke pair). Stays semantically faithful to the
// existing map polygons while picking up the redesigned colors.
const LAND_AGENCIES: { key: string; label: string; fill: string; stroke: string }[] = [
  { key: 'USFS',        label: 'USFS',        fill: 'bg-land-usfs/40',       stroke: 'border-land-usfs-stroke' },
  { key: 'BLM',         label: 'BLM',         fill: 'bg-land-blm/40',        stroke: 'border-land-blm-stroke' },
  { key: 'NPS',         label: 'NPS',         fill: 'bg-land-nps/40',        stroke: 'border-land-nps-stroke' },
  { key: 'STATE_PARK',  label: 'State Park',  fill: 'bg-land-statepark/40',  stroke: 'border-land-statepark-stroke' },
  { key: 'STATE_TRUST', label: 'State Trust', fill: 'bg-land-statetrust/40', stroke: 'border-land-statetrust-stroke' },
  { key: 'LAND_TRUST',  label: 'Land Trust',  fill: 'bg-land-landtrust/40',  stroke: 'border-land-landtrust-stroke' },
];

// Spot marker colors come straight from the pin-* tokens used by the actual
// map markers, so the legend always matches what the user sees on the map.
const SPOT_LEGEND: { dot?: string; label: string; tent?: boolean }[] = [
  { dot: 'bg-pin-safe',       label: 'Known campsite' },
  { dot: 'bg-pin-easy',       label: 'Easy access' },
  { dot: 'bg-pin-moderate',   label: 'Moderate' },
  { dot: 'bg-pin-hard',       label: 'Hard / extreme' },
  { dot: 'bg-pin-campground', label: 'Campground' },
  { tent: true,               label: 'My campsite' },
];

const ROAD_LEGEND: { color: string; label: string }[] = [
  { color: 'bg-road-paved',     label: 'Paved' },
  { color: 'bg-road-passenger', label: 'Passenger' },
  { color: 'bg-road-highclear', label: 'High clearance' },
  { color: 'bg-road-fourwd',    label: '4WD' },
];

export const FloatingLegend = ({
  visibleLandAgencies,
  onToggleLandAgency,
}: FloatingLegendProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="absolute bottom-4 left-4 z-10 w-11 h-11 rounded-full bg-white border border-line shadow-[0_8px_22px_rgba(29,34,24,.12),0_2px_4px_rgba(29,34,24,.06)] flex items-center justify-center hover:bg-cream transition-colors"
          aria-label="Show legend"
        >
          <MapTrifold className="w-4 h-4 text-ink" weight="regular" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 p-4 rounded-[14px] border-line bg-white"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <MapTrifold className="w-4 h-4 text-pine-6" weight="regular" />
            <Mono className="text-pine-6">Map legend</Mono>
          </div>

          {/* Land overlays — toggle on/off; off-state dims to ~50% */}
          <div className="space-y-2.5">
            <Mono className="text-ink-2 block">Land overlays</Mono>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {LAND_AGENCIES.map((a) => {
                const on = visibleLandAgencies.has(a.key);
                return (
                  <button
                    key={a.key}
                    onClick={() => onToggleLandAgency(a.key)}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-2 px-1.5 py-1 rounded-md transition-colors text-left',
                      on ? 'bg-cream' : 'opacity-40 hover:opacity-100 hover:bg-cream/60',
                    )}
                  >
                    <div className={cn('w-3.5 h-3.5 rounded-[3px] border', a.fill, a.stroke)} />
                    <span className="flex-1 text-[12px] text-ink">{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Spot markers */}
          <div className="space-y-2.5">
            <Mono className="text-ink-2 block">Spot markers</Mono>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-ink">
              {SPOT_LEGEND.map(({ dot, label, tent }) => (
                <div key={label} className="flex items-center gap-2">
                  {tent ? (
                    <Tent className="w-3.5 h-3.5 text-pine-6 flex-shrink-0" weight="fill" />
                  ) : (
                    <span className={cn('w-3 h-3 rounded-full flex-shrink-0', dot)} />
                  )}
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Road access */}
          <div className="space-y-2.5">
            <Mono className="text-ink-2 block">Road access</Mono>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-ink">
              {ROAD_LEGEND.map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={cn('w-5 h-0.5 rounded-full flex-shrink-0', color)} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
