import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { WizardStep } from "@/hooks/use-wizard";

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
}

export function WizardProgress({ steps, currentStep }: WizardProgressProps) {
  // Calculate line position as percentage (from center of first to center of last circle)
  const lineStart = 100 / (steps.length * 2); // Center of first item
  const lineEnd = 100 - lineStart; // Center of last item
  const lineWidth = lineEnd - lineStart;
  const progressWidth = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 0;

  return (
    <div className="w-full mb-8">
      {/* Step indicators with connecting line */}
      <div className="relative flex">
        {/* Connecting line - spans from center of first to center of last circle */}
        <div
          className="absolute top-3 h-0.5 bg-muted rounded-full overflow-hidden"
          style={{ left: `${lineStart}%`, width: `${lineWidth}%` }}
        >
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        {steps.map((step, index) => (
          <div key={step.id} className="flex-1 flex flex-col items-center z-10">
            {/* Step circle */}
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                index < currentStep && "bg-primary text-primary-foreground",
                index === currentStep && "bg-primary text-primary-foreground",
                index > currentStep && "bg-muted text-muted-foreground"
              )}
            >
              {index < currentStep ? (
                <Check className="w-3.5 h-3.5" weight="bold" />
              ) : (
                index + 1
              )}
            </div>
            {/* Step title - hidden on mobile */}
            <span
              className={cn(
                "hidden sm:block text-xs mt-2 text-center whitespace-nowrap",
                index === currentStep ? "text-primary font-medium" : "text-muted-foreground"
              )}
            >
              {step.title}
            </span>
          </div>
        ))}
      </div>

      {/* Mobile: Show current step title below */}
      <div className="sm:hidden text-center mt-4">
        <span className="text-sm font-medium text-primary">
          Step {currentStep + 1}: {steps[currentStep]?.title}
        </span>
      </div>
    </div>
  );
}
