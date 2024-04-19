import { useEffect } from 'react';

import { ArrowLeft, Redo } from 'lucide-react';
import type { Organization } from '~/types';
import { Button } from '../../ui/button';
import { useStepper } from '../../ui/stepper';
import type { OnboardingStates } from '.';

interface StepperFooterProps {
  organization?: Organization | null;
  setOnboarding: (value: OnboardingStates) => void;
}

const StepperFooter = ({ organization, setOnboarding }: StepperFooterProps) => {
  const { nextStep, prevStep, isLastStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();

  useEffect(() => {
    console.log('activeStep', activeStep, 'hasCompletedAllSteps', hasCompletedAllSteps);
    if (activeStep === 0 || !hasCompletedAllSteps) return;
    setOnboarding('completed');
  }, [hasCompletedAllSteps, activeStep]);

  return (
    <div className="w-full flex justify-end gap-2 max-sm:justify-stretch">
      {activeStep === 1 && !organization && (
        <Button onClick={prevStep} size="sm" variant="secondary" className="max-sm:w-full">
          <ArrowLeft size={16} className="mr-2" />
          Previous
        </Button>
      )}
      {isOptionalStep && (
        <Button onClick={nextStep} size="sm" variant="secondary" className="max-sm:w-full">
          <Redo size={16} className="mr-2" />
          Skip
        </Button>
      )}
      {!isLastStep && (
        <Button onClick={nextStep} size="sm" className="max-sm:w-full">
          Continue
        </Button>
      )}
      {isLastStep && (
        <Button onClick={() => setOnboarding('completed')} size="sm" className="max-sm:w-full">
          Finish
        </Button>
      )}
    </div>
  );
};

export default StepperFooter;
