import { ArrowLeft, ArrowRight, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

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

export function WizardNavigation({
  onBack,
  onNext,
  onSubmit,
  isFirstStep,
  isLastStep,
  canProceed = true,
  isSubmitting = false,
  nextLabel = "Next",
  submitLabel = "Create Trip",
}: WizardNavigationProps) {
  const handleNextOrSubmit = () => {
    if (isLastStep && onSubmit) {
      onSubmit();
    } else {
      onNext();
    }
  };

  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-border">
      <Button
        variant="ghost"
        onClick={onBack}
        disabled={isFirstStep || isSubmitting}
        className="gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Button>

      <Button
        variant="primary"
        onClick={handleNextOrSubmit}
        disabled={!canProceed || isSubmitting}
        className="gap-2"
      >
        {isSubmitting ? (
          <>
            <SpinnerGap className="w-4 h-4 animate-spin" />
            Creating...
          </>
        ) : isLastStep ? (
          submitLabel
        ) : (
          <>
            {nextLabel}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>
    </div>
  );
}
