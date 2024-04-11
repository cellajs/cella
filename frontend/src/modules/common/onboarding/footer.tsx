import { useEffect, useMemo } from 'react';

import { Button } from '../../ui/button';
import { useStepper } from '../../ui/stepper';
import { dialog } from '~/modules/common/dialoger/state';

const Footer = () => {
  const { currentStep, nextStep, isLastStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();

  useEffect(() => {
    if (activeStep > 0 && hasCompletedAllSteps) dialog.remove();
  }, [hasCompletedAllSteps, activeStep]);

  const buttonText = useMemo(() => {
    if (isLastStep) {
      return 'Finish';
    }

    return 'Continue';
  }, [currentStep?.id]);

  return (
    <div className="w-full flex justify-end gap-2">
      {isOptionalStep && (
        <Button onClick={nextStep} size="sm" variant="secondary">
          Skip
        </Button>
      )}
      <Button size="sm">{buttonText}</Button>
    </div>
  );
};

export default Footer;
