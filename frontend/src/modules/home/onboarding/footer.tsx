import { useEffect } from 'react';

import { ArrowLeft, Redo } from 'lucide-react';
import type { Organization } from '~/types';
import { Button } from '../../ui/button';
import { useStepper } from '~/modules/common/stepper';
import type { OnboardingStates } from '.';
import { useTranslation } from 'react-i18next';

interface StepperFooterProps {
  organization?: Organization | null;
  setOnboarding: (value: OnboardingStates) => void;
}

const StepperFooter = ({ organization, setOnboarding }: StepperFooterProps) => {
  const { nextStep, prevStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();
  const { t } = useTranslation();

  useEffect(() => {
    if (activeStep === 2 && organization === null) setOnboarding('completed');
    if (hasCompletedAllSteps) setOnboarding('completed');
  }, [organization, hasCompletedAllSteps]);

  return (
    <div className="w-full flex justify-end gap-2 max-sm:justify-stretch">
      {activeStep === 1 && !organization && (
        <Button onClick={prevStep}  variant="secondary" className="max-sm:w-full">
          <ArrowLeft size={16} className="mr-2" />
          {t('common:previous')}
        </Button>
      )}
      {isOptionalStep && (
        <Button onClick={nextStep} variant="secondary" className="max-sm:w-full">
          <Redo size={16} className="mr-2" />
          {t('common:skip')}
        </Button>
      )}
      {/* {activeStep === 0 && (
        <Button type="submit" onClick={nextStep} className="max-sm:w-full">
          {t('common:continue')}
        </Button>
      )} */}
      {/* {isLastStep && (
        <Button type="submit" onClick={() => setOnboarding('completed')} className="max-sm:w-full">
          {t('common:finish')}
        </Button>
      )} */}
    </div>
  );
};

export default StepperFooter;
