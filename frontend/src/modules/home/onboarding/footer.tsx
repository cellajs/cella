import { useEffect } from 'react';

import { ArrowLeft, Redo } from 'lucide-react';
import type { Organization } from '~/types';
import { Button } from '../../ui/button';
import { useStepper } from '../../ui/stepper';
import type { OnboardingStates } from '.';
import { useTranslation } from 'react-i18next';

interface StepperFooterProps {
  organization?: Organization | null;
  setOnboarding: (value: OnboardingStates) => void;
}

const StepperFooter = ({ organization, setOnboarding }: StepperFooterProps) => {
  const { nextStep, prevStep, isLastStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();
  const { t } = useTranslation();

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
          {t('common:previous')}
        </Button>
      )}
      {isOptionalStep && (
        <Button onClick={nextStep} size="sm" variant="secondary" className="max-sm:w-full">
          <Redo size={16} className="mr-2" />
          {t('common:skip')}
        </Button>
      )}
      {!isLastStep && (
        <Button onClick={nextStep} size="sm" className="max-sm:w-full">
          {t('common:continue')}
        </Button>
      )}
      {isLastStep && (
        <Button onClick={() => setOnboarding('completed')} size="sm" className="max-sm:w-full">
          {t('common:finish')}
        </Button>
      )}
    </div>
  );
};

export default StepperFooter;
