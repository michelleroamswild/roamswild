import { MapTrifold, Tent, Sparkle, Compass, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Mono } from "@/components/redesign";

export type BuildMethod = 'ai' | 'manual';

interface StepBuildMethodProps {
  buildMethod: BuildMethod | null;
  setBuildMethod: (method: BuildMethod) => void;
}

// Two-card chooser. Each card uses a distinct accent (water for AI, clay for
// manual) so the page reads with color even before a selection is made.
const OPTIONS: Array<{
  id: BuildMethod;
  title: string;
  copy: string;
  hintIcon: typeof MapTrifold;
  hint: string;
  bigIcon: typeof Sparkle;
  accent: {
    iconBg: string;
    iconText: string;
    border: string;
    selectedBorder: string;
    selectedBg: string;
    hintText: string;
    check: string;
  };
}> = [
  {
    id: 'ai',
    title: 'Plan my route',
    copy: 'Drop in your destinations and let AI sketch a complete itinerary — campsites, hikes, scenic stops.',
    hintIcon: MapTrifold,
    hint: 'Best for exploring new areas',
    bigIcon: Sparkle,
    accent: {
      iconBg: 'bg-water/15',
      iconText: 'text-water',
      border: 'border-line',
      selectedBorder: 'border-water',
      selectedBg: 'bg-water/[0.06]',
      hintText: 'text-water',
      check: 'bg-water',
    },
  },
  {
    id: 'manual',
    title: 'Build my own',
    copy: 'Pick your campsites and stops day by day, with smart suggestions to keep things flowing.',
    hintIcon: Tent,
    hint: 'Best when you know your spots',
    bigIcon: Compass,
    accent: {
      iconBg: 'bg-clay/15',
      iconText: 'text-clay',
      border: 'border-line',
      selectedBorder: 'border-clay',
      selectedBg: 'bg-clay/[0.06]',
      hintText: 'text-clay',
      check: 'bg-clay',
    },
  },
];

export function StepBuildMethod({ buildMethod, setBuildMethod }: StepBuildMethodProps) {
  return (
    <div className="space-y-7">
      <div className="text-center">
        <Mono className="text-pine-6">Step 02 · Build method</Mono>
        <h2 className="font-sans font-bold tracking-[-0.025em] text-ink text-[28px] md:text-[34px] leading-[1.1] mt-2">
          How do you want to build it?
        </h2>
        <p className="text-[15px] text-ink-3 mt-2">
          Choose your adventure style.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {OPTIONS.map(({ id, title, copy, hintIcon: HintIcon, hint, bigIcon: BigIcon, accent }) => {
          const selected = buildMethod === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setBuildMethod(id)}
              className={cn(
                'relative flex flex-col items-start text-left p-6 rounded-[18px] border bg-white dark:bg-paper-2 transition-all',
                'hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(29,34,24,.08),0_3px_8px_rgba(29,34,24,.04)]',
                selected ? `${accent.selectedBorder} ${accent.selectedBg}` : accent.border,
              )}
            >
              {selected && (
                <div className={cn('absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center', accent.check)}>
                  <Check className="w-3.5 h-3.5 text-cream" weight="bold" />
                </div>
              )}

              <div className={cn('w-14 h-14 rounded-[14px] flex items-center justify-center mb-5', accent.iconBg, accent.iconText)}>
                <BigIcon className="w-7 h-7" weight="regular" />
              </div>

              <h3 className="text-[18px] font-sans font-semibold tracking-[-0.01em] text-ink mb-1.5">
                {title}
              </h3>
              <p className="text-[14px] text-ink-3 leading-[1.55]">{copy}</p>

              <div className={cn('mt-5 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.10em] font-semibold', accent.hintText)}>
                <HintIcon className="w-3.5 h-3.5" weight="regular" />
                {hint}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
