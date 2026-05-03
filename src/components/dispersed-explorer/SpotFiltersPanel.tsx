import { ReactNode } from 'react';
import { Truck, Check } from '@phosphor-icons/react';
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

type RoadFilter = 'all' | 'passenger' | 'high-clearance' | '4wd';

interface SpotFiltersPanelProps {
  spotFilters: Set<string>;
  onToggleFilter: (filter: string) => void;
  onClearFilters: () => void;
  roadFilter: RoadFilter;
  onChangeRoadFilter: (filter: RoadFilter) => void;
  /** Optional — when present, lets users toggle land overlays from the filter
      panel (matches the design's "Land manager" section). */
  visibleLandAgencies?: Set<string>;
  onToggleLandAgency?: (key: string) => void;
}

// Matches the Pine Grove "explore-mapfirst-split" filter layout: each block
// is a FilterGroup with a mono title + count, separated by a border-top, body
// is either a checkbox column (with counts) or a pill row.
const FilterGroup = ({
  title,
  count,
  children,
  first = false,
}: {
  title: string;
  count?: string;
  children: ReactNode;
  first?: boolean;
}) => (
  <div className={cn('py-3.5', !first && 'border-t border-line')}>
    <div className="flex items-center justify-between mb-2">
      <Mono className="text-ink-2">{title}</Mono>
      {count && <Mono className="text-ink-3">{count}</Mono>}
    </div>
    {children}
  </div>
);

// Accent → static Tailwind class triples. JIT can't compile dynamic class
// names so each accent is a flat lookup. Keeps the checkbox + dot in sync.
type Accent =
  | 'pin-safe' | 'pin-easy' | 'pin-moderate' | 'pin-campground' | 'pin-community'
  | 'pine-6'
  | 'land-blm' | 'land-usfs' | 'land-nps' | 'land-statepark' | 'land-statetrust' | 'land-landtrust' | 'land-tribal';

const ACCENT_CLASSES: Record<Accent, { bg: string; border: string; dot: string }> = {
  'pin-safe':       { bg: 'bg-pin-safe',           border: 'border-pin-safe',           dot: 'bg-pin-safe' },
  'pin-easy':       { bg: 'bg-pin-easy',           border: 'border-pin-easy',           dot: 'bg-pin-easy' },
  'pin-moderate':   { bg: 'bg-pin-moderate',       border: 'border-pin-moderate',       dot: 'bg-pin-moderate' },
  'pin-campground': { bg: 'bg-pin-campground',     border: 'border-pin-campground',     dot: 'bg-pin-campground' },
  'pin-community':  { bg: 'bg-pin-community',      border: 'border-pin-community',      dot: 'bg-pin-community' },
  'pine-6':         { bg: 'bg-pine-6',             border: 'border-pine-6',             dot: 'bg-pine-6' },
  'land-blm':        { bg: 'bg-land-blm-stroke',        border: 'border-land-blm-stroke',        dot: 'bg-land-blm-stroke' },
  'land-usfs':       { bg: 'bg-land-usfs-stroke',       border: 'border-land-usfs-stroke',       dot: 'bg-land-usfs-stroke' },
  'land-nps':        { bg: 'bg-land-nps-stroke',        border: 'border-land-nps-stroke',        dot: 'bg-land-nps-stroke' },
  'land-statepark':  { bg: 'bg-land-statepark-stroke',  border: 'border-land-statepark-stroke',  dot: 'bg-land-statepark-stroke' },
  'land-statetrust': { bg: 'bg-land-statetrust-stroke', border: 'border-land-statetrust-stroke', dot: 'bg-land-statetrust-stroke' },
  'land-landtrust':  { bg: 'bg-land-landtrust-stroke',  border: 'border-land-landtrust-stroke',  dot: 'bg-land-landtrust-stroke' },
  'land-tribal':     { bg: 'bg-land-tribal-stroke',     border: 'border-land-tribal-stroke',     dot: 'bg-land-tribal-stroke' },
};

// Native checkbox styled to match the design — accent fill when checked,
// neutral outline when not, with a colored dot to the left so the legend
// reads even when the row is unchecked.
const CheckRow = ({
  label,
  on,
  onClick,
  accent,
  count,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  accent?: Accent;
  count?: string | number;
}) => {
  const a = accent ? ACCENT_CLASSES[accent] : null;
  return (
    <label className="flex items-center gap-2.5 py-1 cursor-pointer group select-none">
      <input
        type="checkbox"
        checked={on}
        onChange={onClick}
        className="sr-only peer"
      />
      <span
        className={cn(
          'w-4 h-4 rounded-[3px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors',
          on
            ? cn(a?.bg ?? 'bg-ink', a?.border ?? 'border-ink')
            : 'border-ink-3/40 bg-transparent group-hover:border-ink-3',
        )}
      >
        {on && <Check className="w-2.5 h-2.5 text-cream" weight="bold" />}
      </span>
      {a && !on && <span className={cn('w-2 h-2 rounded-full flex-shrink-0', a.dot)} />}
      <span
        className={cn(
          'flex-1 text-[13px] transition-colors',
          on ? 'text-ink font-semibold' : 'text-ink-3 group-hover:text-ink',
        )}
      >
        {label}
      </span>
      {count != null && <Mono className="text-ink-3">{count}</Mono>}
    </label>
  );
};

// Inline pill (used for vehicle access + confidence + amenities rows).
const InlinePill = ({
  label,
  active,
  onClick,
  Icon,
  activeBg = 'bg-pine-6',
  activeBorder = 'border-pine-6',
  activeText = 'text-cream',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  Icon?: typeof Truck;
  activeBg?: string;
  activeBorder?: string;
  activeText?: string;
}) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono uppercase tracking-[0.10em] font-semibold transition-colors',
      active ? `${activeBg} ${activeBorder} ${activeText}` : 'bg-white dark:bg-paper border-line dark:border-line-2 text-ink-3 hover:text-ink hover:border-ink-3',
    )}
  >
    {Icon && <Icon className="w-3 h-3" weight="regular" />}
    {label}
  </button>
);

const SPOT_TYPES: { key: string; label: string; accent: Accent }[] = [
  { key: 'known',       label: 'Known sites',     accent: 'pin-safe' },
  { key: 'community',   label: 'Community',       accent: 'pin-community' },
  { key: 'high',        label: 'High confidence', accent: 'pin-easy' },
  { key: 'medium',      label: 'Moderate',        accent: 'pin-moderate' },
  { key: 'campgrounds', label: 'Campgrounds',     accent: 'pin-campground' },
  { key: 'mine',        label: 'My sites',        accent: 'pine-6' },
];

const LAND_MANAGERS: { key: string; label: string; accent: Accent }[] = [
  { key: 'BLM',         label: 'BLM',          accent: 'land-blm' },
  { key: 'USFS',        label: 'USFS',         accent: 'land-usfs' },
  { key: 'NPS',         label: 'NPS',          accent: 'land-nps' },
  { key: 'STATE_PARK',  label: 'State park',   accent: 'land-statepark' },
  { key: 'STATE_TRUST', label: 'State trust',  accent: 'land-statetrust' },
  { key: 'LAND_TRUST',  label: 'Land trust',   accent: 'land-landtrust' },
  { key: 'TRIBAL',      label: 'Tribal land',  accent: 'land-tribal' },
];

export const SpotFiltersPanel = ({
  spotFilters,
  onToggleFilter,
  roadFilter,
  onChangeRoadFilter,
  visibleLandAgencies,
  onToggleLandAgency,
}: SpotFiltersPanelProps) => {
  const spotActiveCount = SPOT_TYPES.filter((s) => spotFilters.has(s.key)).length;
  const landActiveCount = visibleLandAgencies
    ? LAND_MANAGERS.filter((l) => visibleLandAgencies.has(l.key)).length
    : 0;

  return (
    <div>
      {/* Spot type — checkbox column */}
      <FilterGroup
        title="Spot type"
        count={`${spotActiveCount} of ${SPOT_TYPES.length}`}
        first
      >
        {SPOT_TYPES.map((t) => (
          <CheckRow
            key={t.key}
            label={t.label}
            on={spotFilters.has(t.key)}
            onClick={() => onToggleFilter(t.key)}
            accent={t.accent}
          />
        ))}
      </FilterGroup>

      {/* Vehicle access — pill row */}
      <FilterGroup title="Vehicle access">
        <div className="flex flex-wrap gap-1.5">
          <InlinePill
            label="Any"
            active={roadFilter === 'all'}
            onClick={() => onChangeRoadFilter('all')}
            activeBg="bg-ink"
            activeBorder="border-ink"
          />
          <InlinePill
            label="Passenger"
            active={roadFilter === 'passenger'}
            onClick={() => onChangeRoadFilter('passenger')}
            Icon={Truck}
            activeBg="bg-road-passenger"
            activeBorder="border-road-passenger"
          />
          <InlinePill
            label="HC+"
            active={roadFilter === 'high-clearance'}
            onClick={() => onChangeRoadFilter('high-clearance')}
            activeBg="bg-road-highclear"
            activeBorder="border-road-highclear"
          />
          <InlinePill
            label="4WD only"
            active={roadFilter === '4wd'}
            onClick={() => onChangeRoadFilter('4wd')}
            activeBg="bg-road-fourwd"
            activeBorder="border-road-fourwd"
          />
        </div>
      </FilterGroup>

      {/* Land manager — only renders if the parent passes toggles */}
      {visibleLandAgencies && onToggleLandAgency && (
        <FilterGroup title="Land manager" count={`${landActiveCount} of ${LAND_MANAGERS.length}`}>
          {LAND_MANAGERS.map((l) => (
            <CheckRow
              key={l.key}
              label={l.label}
              on={visibleLandAgencies.has(l.key)}
              onClick={() => onToggleLandAgency(l.key)}
              accent={l.accent}
            />
          ))}
        </FilterGroup>
      )}

    </div>
  );
};

