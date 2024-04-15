import { useEffect } from 'react';

import { Button } from '../../ui/button';
import { useStepper } from '../../ui/stepper';
import { dialog } from '~/modules/common/dialoger/state';
import type { Organization } from '~/types';
import { ArrowLeft, Redo } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const StepperFooter = ({ organization }: { organization?: Organization | null }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { nextStep, prevStep, isLastStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();

  useEffect(() => {
    if (activeStep === 0 || !hasCompletedAllSteps) return;
    toast.success(t('common:success.onboarding'));
    dialog.remove();
    navigate({ to: '/home', replace: true });
  }, [hasCompletedAllSteps, activeStep]);

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
      <Button size="sm">{isLastStep ? 'Finish' : 'Continue'}</Button>
    </div>
  );
};

export default StepperFooter;
