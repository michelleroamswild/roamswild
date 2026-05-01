import { ArrowLeft, ArrowRight, SpinnerGap } from "@phosphor-icons/react";
import { Pill } from "@/components/redesign";

interface WizardNavigationProps {
  onBack: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  canProceed?: boolean;
  isSubmitting?: boolean;
  nextLabel?: string;
  submitLabel?: string;
}

// Sticky footer with the Back / Next pair. Cream surface with a thin top
// border so it reads as part of the page rather than a floating bar.
export function WizardNavigation({
  onBack,
  onNext,
  onSubmit,
  isFirstStep,
  isLastStep,
  canProceed = true,
  isSubmitting = false,
  nextLabel = "Continue",
  submitLabel = "Create trip",
}: WizardNavigationProps) {
  const handleNextOrSubmit = () => {
    if (isLastStep && onSubmit) onSubmit();
    else onNext();
  };

  const nextDisabled = !canProceed || isSubmitting;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 bg-cream/95 dark:bg-paper-2/95 backdrop-blur-md border-t border-line">
      <div className="max-w-[1440px] mx-auto px-4 md:px-14 py-3.5 flex items-center justify-between gap-3">
        <Pill
          variant="ghost"
          mono={false}
          onClick={onBack}
          className={(isFirstStep || isSubmitting) ? 'opacity-40 pointer-events-none' : ''}
        >
          <ArrowLeft className="w-3.5 h-3.5" weight="bold" />
          Back
        </Pill>

        <Pill
          variant={isLastStep ? 'solid-pine' : 'solid-ink'}
          mono={false}
          onClick={handleNextOrSubmit}
          className={nextDisabled ? 'opacity-50 pointer-events-none' : ''}
        >
          {isSubmitting ? (
            <>
              <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
              Creating…
            </>
          ) : isLastStep ? (
            <>
              {submitLabel}
              <ArrowRight className="w-3.5 h-3.5" weight="bold" />
            </>
          ) : (
            <>
              {nextLabel}
              <ArrowRight className="w-3.5 h-3.5" weight="bold" />
            </>
          )}
        </Pill>
      </div>
    </footer>
  );
}
