import { useEffect } from 'react';

import { ArrowLeft, Redo } from 'lucide-react';
import type { Organization } from '~/types';
import { Button } from '../../ui/button';
import { useStepper } from '../../ui/stepper';

interface StepperFooterProps {
  organization?: Organization | null;
  setOnboardingCompleted?: (val: boolean) => void;
}

const StepperFooter = ({ organization, setOnboardingCompleted }: StepperFooterProps) => {
  const { nextStep, prevStep, isLastStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();

  useEffect(() => {
    if (activeStep === 0 || !hasCompletedAllSteps) return;
    if (setOnboardingCompleted) {
      setOnboardingCompleted(true);
    }
  }, [hasCompletedAllSteps, activeStep]);

  const handleComplete = () => {
    if (setOnboardingCompleted) {
      setOnboardingCompleted(true);
    }
  };

  return (
    <div className="w-full flex justify-end gap-2">
      {activeStep === 1 && !organization && (
        <Button onClick={prevStep} size="sm" variant="secondary">
          <ArrowLeft size={16} className="mr-2" />
          Previous
        </Button>
      )}
      {isOptionalStep && (
        <Button onClick={nextStep} size="sm" variant="secondary">
          <Redo size={16} className="mr-2" />
          Skip
        </Button>
      )}
      <Button onClick={handleComplete} size="sm">
        {isLastStep ? 'Finish' : 'Continue'}
      </Button>
    </div>
  );
};

export default StepperFooter;
