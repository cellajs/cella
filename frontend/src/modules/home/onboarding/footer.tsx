import { useEffect } from 'react';

import { ArrowLeft, Redo } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStepper } from '~/modules/common/stepper';
import type { Organization } from '~/types';
import type { OnboardingStates } from '.';
import { Button } from '../../ui/button';

interface StepperFooterProps {
  organization?: Organization | null;
  setOnboarding: (value: OnboardingStates) => void;
}

const StepperFooter = ({ organization, setOnboarding }: StepperFooterProps) => {
  const { nextStep, prevStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();
  const { t } = useTranslation();

  // prevent accidental submit
  const skipStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    nextStep();
  };

  // prevent accidental submit
  const backStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    prevStep();
  };

  useEffect(() => {
    console.log('stepper footer', activeStep, organization, hasCompletedAllSteps);
    if (activeStep === 2 && organization === null) setOnboarding('completed');
    if (hasCompletedAllSteps) setOnboarding('completed');
  }, [organization, hasCompletedAllSteps]);

  return (
    <div className="w-full flex justify-end gap-2 max-sm:justify-stretch">
      {activeStep === 1 && !organization && (
        <Button onClick={backStep} variant="secondary" className="max-sm:w-full">
          <ArrowLeft size={16} className="mr-2" />
          {t('common:previous')}
        </Button>
      )}
      {isOptionalStep && (
        <Button onClick={skipStep} variant="secondary" className="max-sm:w-full">
          <Redo size={16} className="mr-2" />
          {t('common:skip')}
        </Button>
      )}
    </div>
  );
};

export default StepperFooter;
