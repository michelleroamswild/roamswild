import { Tent, Buildings, MapPinSimpleArea, House } from "@phosphor-icons/react";
import { LodgingType } from "@/types/trip";
import { Mono } from "@/components/redesign";
import { cn } from "@/lib/utils";

const LODGING_OPTIONS: Array<{
  id: LodgingType;
  label: string;
  description: string;
  icon: typeof Tent;
}> = [
  { id: 'dispersed',  label: 'Dispersed camping',     description: 'Free camping on public land — BLM, USFS, dispersed sites.', icon: Tent },
  { id: 'campground', label: 'Established campground', description: 'Reservable sites with amenities — bathrooms, picnic tables.', icon: Buildings },
];

const CAMPSITE_SELECTION_OPTIONS = [
  {
    id: 'best-each-night',
    label: 'Different camp each night',
    description: "We'll find the best available campsite for each night of your route.",
    baseCampMode: false,
    icon: MapPinSimpleArea,
  },
  {
    id: 'basecamp',
    label: 'Same basecamp every night',
    description: 'Stay in one spot and explore from there — great for one region.',
    baseCampMode: true,
    icon: House,
  },
];

interface StepLodgingProps {
  globalLodging: LodgingType;
  setGlobalLodging: (type: LodgingType) => void;
  baseCampMode: boolean;
  setBaseCampMode: (value: boolean) => void;
}

export function StepLodging({
  globalLodging,
  setGlobalLodging,
  baseCampMode,
  setBaseCampMode,
}: StepLodgingProps) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <Mono className="text-pine-6">Step 04 · Lodging</Mono>
        <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[34px] leading-[1.1] mt-2">
          Where will you sleep?
        </h2>
        <p className="text-[15px] text-ink-3 mt-2">
          Pick a lodging style and how we should choose your spots.
        </p>
      </div>

      {/* Lodging type */}
      <fieldset className="space-y-3">
        <Mono className="text-ink-2 block">Lodging type</Mono>
        <div className="grid sm:grid-cols-2 gap-3">
          {LODGING_OPTIONS.map(({ id, label, description, icon: Icon }) => (
            <RadioCard
              key={id}
              name="lodging-type"
              value={id}
              checked={globalLodging === id}
              onChange={() => setGlobalLodging(id)}
              icon={Icon}
              accent={id === 'dispersed' ? 'pine' : 'water'}
              label={label}
              description={description}
            />
          ))}
        </div>
      </fieldset>

      {/* Campsite selection mode */}
      <fieldset className="space-y-3">
        <Mono className="text-ink-2 block">How should we pick your camps?</Mono>
        <div className="grid gap-3">
          {CAMPSITE_SELECTION_OPTIONS.map(({ id, label, description, baseCampMode: bm, icon: Icon }) => (
            <RadioCard
              key={id}
              name="campsite-selection"
              value={id}
              checked={baseCampMode === bm}
              onChange={() => setBaseCampMode(bm)}
              icon={Icon}
              accent={bm ? 'clay' : 'sage'}
              label={label}
              description={description}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// Pill-card radio — accent color highlights the selected option.
type AccentName = 'pine' | 'sage' | 'water' | 'clay';
const ACCENT: Record<AccentName, { iconBg: string; iconText: string; selectedBorder: string; selectedBg: string; dot: string }> = {
  pine:  { iconBg: 'bg-pine-6/12', iconText: 'text-pine-6', selectedBorder: 'border-pine-6', selectedBg: 'bg-pine-6/[0.06]', dot: 'border-pine-6 bg-pine-6' },
  sage:  { iconBg: 'bg-sage/15',   iconText: 'text-sage',   selectedBorder: 'border-sage',   selectedBg: 'bg-sage/[0.06]',   dot: 'border-sage bg-sage' },
  water: { iconBg: 'bg-water/15',  iconText: 'text-water',  selectedBorder: 'border-water',  selectedBg: 'bg-water/[0.06]',  dot: 'border-water bg-water' },
  clay:  { iconBg: 'bg-clay/15',   iconText: 'text-clay',   selectedBorder: 'border-clay',   selectedBg: 'bg-clay/[0.06]',   dot: 'border-clay bg-clay' },
};

const RadioCard = ({
  name,
  value,
  checked,
  onChange,
  icon: Icon,
  accent,
  label,
  description,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  icon: typeof Tent;
  accent: AccentName;
  label: string;
  description: string;
}) => {
  const a = ACCENT[accent];
  return (
    <label
      className={cn(
        'group flex items-start gap-4 p-4 rounded-[14px] border bg-white cursor-pointer transition-all',
        'hover:border-ink-3/40',
        checked ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div className={cn('w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0', a.iconBg, a.iconText)}>
        <Icon className="w-5 h-5" weight="regular" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">{label}</div>
        <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">{description}</p>
      </div>
      {/* Selection indicator dot */}
      <div className={cn(
        'w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
        checked ? a.dot : 'border-ink-3/40 bg-transparent',
      )}>
        {checked && <span className="w-2 h-2 rounded-full bg-cream" />}
      </div>
    </label>
  );
};
