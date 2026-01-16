import { useState, useCallback } from 'react';

export interface WizardStep {
  id: string;
  title: string;
  isOptional?: boolean;
}

interface UseWizardOptions {
  steps: WizardStep[];
  initialStep?: number;
  onStepChange?: (step: number) => void;
}

interface UseWizardReturn {
  currentStep: number;
  currentStepData: WizardStep;
  steps: WizardStep[];
  isFirstStep: boolean;
  isLastStep: boolean;
  progress: number;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
}

export function useWizard({ steps, initialStep = 0, onStepChange }: UseWizardOptions): UseWizardReturn {
  const [currentStep, setCurrentStep] = useState(initialStep);

  const goNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      onStepChange?.(nextStep);
    }
  }, [currentStep, steps.length, onStepChange]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      onStepChange?.(prevStep);
    }
  }, [currentStep, onStepChange]);

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < steps.length) {
      setCurrentStep(step);
      onStepChange?.(step);
    }
  }, [steps.length, onStepChange]);

  const progress = ((currentStep + 1) / steps.length) * 100;

  return {
    currentStep,
    currentStepData: steps[currentStep],
    steps,
    isFirstStep: currentStep === 0,
    isLastStep: currentStep === steps.length - 1,
    progress,
    goNext,
    goBack,
    goToStep,
  };
}
