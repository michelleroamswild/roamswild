import { Sparkle, PencilSimple, Check, Mountains, Camera, Jeep } from "@phosphor-icons/react";
import { Mono } from "@/components/redesign";
import { cn } from "@/lib/utils";

export type ActivitiesMode = 'ai' | 'manual';

interface StepActivitiesProps {
  mode: ActivitiesMode;
  setMode: (mode: ActivitiesMode) => void;
  activities: string[];
  setActivities: (activities: string[]) => void;
}

type AccentName = 'water' | 'clay' | 'sage' | 'ember';
const ACCENT: Record<AccentName, { iconBg: string; iconText: string; selectedBorder: string; selectedBg: string; check: string; dot: string }> = {
  water: { iconBg: 'bg-water/15', iconText: 'text-water', selectedBorder: 'border-water', selectedBg: 'bg-water/[0.06]', check: 'bg-water', dot: 'border-water bg-water' },
  clay:  { iconBg: 'bg-clay/15',  iconText: 'text-clay',  selectedBorder: 'border-clay',  selectedBg: 'bg-clay/[0.06]',  check: 'bg-clay',  dot: 'border-clay bg-clay' },
  sage:  { iconBg: 'bg-sage/15',  iconText: 'text-sage',  selectedBorder: 'border-sage',  selectedBg: 'bg-sage/[0.06]',  check: 'bg-sage',  dot: 'border-sage bg-sage' },
  ember: { iconBg: 'bg-ember/15', iconText: 'text-ember', selectedBorder: 'border-ember', selectedBg: 'bg-ember/[0.06]', check: 'bg-ember', dot: 'border-ember bg-ember' },
};

const MODE_OPTIONS: Array<{
  id: ActivitiesMode;
  title: string;
  description: string;
  icon: typeof Sparkle;
  accent: AccentName;
}> = [
  {
    id: 'ai',
    title: 'Surprise me',
    description: 'AI picks the highlights at each destination — hikes, viewpoints, towns.',
    icon: Sparkle,
    accent: 'water',
  },
  {
    id: 'manual',
    title: "I'll choose",
    description: 'Pick activities yourself from suggestions for each destination.',
    icon: PencilSimple,
    accent: 'clay',
  },
];

const ACTIVITY_TYPES: Array<{ id: string; label: string; description: string; icon: typeof Mountains; accent: AccentName }> = [
  { id: 'hiking',      label: 'Hiking',      description: 'Find trails near your route — easy strolls to summit pushes.', icon: Mountains, accent: 'sage' },
  { id: 'photography', label: 'Photography', description: 'Surface scenic viewpoints and golden-hour-friendly stops.',     icon: Camera,    accent: 'ember' },
  { id: 'offroading',  label: 'Offroading',  description: 'Find OHV trails and high-clearance routes along the way.',      icon: Jeep,      accent: 'clay' },
];

export function StepActivities({ mode, setMode, activities, setActivities }: StepActivitiesProps) {
  const toggleActivity = (id: string, checked: boolean) => {
    if (checked) setActivities([...activities, id]);
    else setActivities(activities.filter((x) => x !== id));
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <Mono className="text-pine-6">Activities</Mono>
        <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[34px] leading-[1.1] mt-2">
          What do you want to do?
        </h2>
        <p className="text-[15px] text-ink-3 mt-2">
          Pick what you're into, then choose how we surface it.
        </p>
      </div>

      {/* Activity types */}
      <fieldset className="space-y-3">
        <Mono className="text-ink-2 block">Activity types</Mono>
        <div className="space-y-3">
          {ACTIVITY_TYPES.map(({ id, label, description, icon: Icon, accent }) => {
            const a = ACCENT[accent];
            const selected = activities.includes(id);
            return (
              <label
                key={id}
                className={cn(
                  'flex items-start gap-4 p-4 rounded-[14px] border bg-white dark:bg-paper-2 cursor-pointer transition-all',
                  selected ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line hover:border-ink-3/40',
                )}
              >
                <div className={cn('w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0', a.iconBg, a.iconText)}>
                  <Icon className="w-5 h-5" weight="regular" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-sans font-semibold tracking-[-0.005em] text-ink">{label}</div>
                  <p className="text-[13px] text-ink-3 mt-0.5 leading-[1.5]">{description}</p>
                </div>
                <div className={cn(
                  'w-5 h-5 rounded-[5px] border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
                  selected ? a.dot : 'border-ink-3/40 bg-transparent',
                )}>
                  {selected && <Check className="w-3 h-3 text-cream" weight="bold" />}
                </div>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => toggleActivity(id, e.target.checked)}
                  className="sr-only"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Mode picker */}
      <fieldset className="space-y-3 pt-2 border-t border-line">
        <div className="pt-6">
          <Mono className="text-ink-2 block">How should we surface them?</Mono>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MODE_OPTIONS.map(({ id, title, description, icon: Icon, accent }) => {
            const a = ACCENT[accent];
            const selected = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  'relative flex flex-col items-start text-left p-6 rounded-[18px] border bg-white dark:bg-paper-2 transition-all',
                  'hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]',
                  selected ? `${a.selectedBorder} ${a.selectedBg}` : 'border-line',
                )}
              >
                {selected && (
                  <div className={cn('absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center', a.check)}>
                    <Check className="w-3.5 h-3.5 text-cream" weight="bold" />
                  </div>
                )}

                <div className={cn('w-14 h-14 rounded-[14px] flex items-center justify-center mb-5', a.iconBg, a.iconText)}>
                  <Icon className="w-7 h-7" weight="regular" />
                </div>

                <h3 className="text-[18px] font-sans font-semibold tracking-[-0.01em] text-ink mb-1.5">
                  {title}
                </h3>
                <p className="text-[14px] text-ink-3 leading-[1.55]">{description}</p>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
