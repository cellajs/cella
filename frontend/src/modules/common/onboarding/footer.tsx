import { useMemo } from 'react';

import { Button } from '../../ui/button';
import { useStepper } from '../../ui/stepper';

const Footer = () => {
  const { currentStep, prevStep, isLastStep, isOptionalStep } = useStepper();

  const buttonText = useMemo(() => {

    if (isOptionalStep) {
      return 'Skip';
    }

    if (isLastStep) {
      return 'Finish';
    }

    return 'Continue';
  }, [currentStep?.id]);

  return (
    <div className="w-full flex justify-end gap-2">
      {currentStep?.id !== 'step-1' && (
        <Button onClick={prevStep} size="sm" variant="secondary">
          Previous
        </Button>
      )}
      <Button size="sm">{buttonText}</Button>
    </div>
  );
};

export default Footer;
