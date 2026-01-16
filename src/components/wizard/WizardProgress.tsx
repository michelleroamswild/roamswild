import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { WizardStep } from "@/hooks/use-wizard";

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
}

export function WizardProgress({ steps, currentStep }: WizardProgressProps) {
  return (
    <div className="w-full mb-8">
      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300",
                  index < currentStep && "bg-primary text-primary-foreground",
                  index === currentStep && "bg-primary/20 border-2 border-primary text-primary",
                  index > currentStep && "bg-muted text-muted-foreground"
                )}
              >
                {index < currentStep ? (
                  <Check className="w-5 h-5" weight="bold" />
                ) : (
                  index + 1
                )}
              </div>
              {/* Step title - hidden on mobile, shown on larger screens */}
              <span
                className={cn(
                  "hidden sm:block text-xs mt-2 text-center max-w-[80px]",
                  index === currentStep ? "text-primary font-medium" : "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </div>

            {/* Connecting line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-1 flex-1 mx-2 rounded-full transition-all duration-300",
                  index < currentStep ? "bg-primary" : "bg-muted"
                )}
              />
            )}
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
