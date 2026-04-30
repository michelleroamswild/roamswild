import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { WizardStep } from "@/hooks/use-wizard";
import { Mono } from "@/components/redesign";

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
}

// Pine + Paper progress: connecting line in line color → pine fill as the user
// advances; checked steps show a Check inside a pine circle, current = ink,
// future = white with line border.
export function WizardProgress({ steps, currentStep }: WizardProgressProps) {
  // Position the connecting line so it spans circle-center to circle-center.
  const lineStart = 100 / (steps.length * 2);
  const lineEnd = 100 - lineStart;
  const lineWidth = lineEnd - lineStart;
  const progressWidth = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 0;

  return (
    <div className="w-full">
      <div className="relative flex">
        {/* Connecting track */}
        <div
          className="absolute top-3.5 h-[2px] bg-line rounded-full overflow-hidden"
          style={{ left: `${lineStart}%`, width: `${lineWidth}%` }}
        >
          <div
            className="h-full bg-pine-6 rounded-full transition-all duration-300"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        {steps.map((step, index) => {
          const isDone = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <div key={step.id} className="flex-1 flex flex-col items-center z-10">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono font-bold transition-all duration-200",
                  isDone && "bg-pine-6 text-cream",
                  isCurrent && "bg-ink text-cream ring-4 ring-ink/10",
                  !isDone && !isCurrent && "bg-white border border-line text-ink-3",
                )}
              >
                {isDone ? <Check className="w-3.5 h-3.5" weight="bold" /> : index + 1}
              </div>
              {/* Step title — desktop only */}
              <span
                className={cn(
                  "hidden sm:block text-[11px] font-mono uppercase tracking-[0.10em] mt-2 text-center whitespace-nowrap",
                  isCurrent ? "text-ink font-semibold" : isDone ? "text-pine-6 font-semibold" : "text-ink-3",
                )}
              >
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: show current step as mono caps */}
      <div className="sm:hidden text-center mt-4">
        <Mono className="text-pine-6">
          Step {currentStep + 1} · {steps[currentStep]?.title}
        </Mono>
      </div>
    </div>
  );
}
