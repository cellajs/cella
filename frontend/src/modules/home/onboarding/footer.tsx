import { RedoIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { SkipOrganization, skipOrganizationDialogId } from '~/modules/home/onboarding/skip-organization';
import { Button } from '~/modules/ui/button';

interface StepperFooterProps {
  onComplete: () => void;
}

/** Skipping the organization step asks for confirmation; other optional steps skip straight through. */
export function StepperFooter({ onComplete }: StepperFooterProps) {
  const { nextStep, isOptionalStep, currentStep, hasCompletedAllSteps } = useStepper();
  const { t } = useTranslation();

  const skipButtonRef = useRef(null);

  useEffect(() => {
    if (hasCompletedAllSteps) onComplete();
  }, [hasCompletedAllSteps]);

  const skipStep = () => {
    if (currentStep?.id === 'organization') {
      dialoger.getState().create(<SkipOrganization onComplete={onComplete} />, {
        id: skipOrganizationDialogId,
        triggerRef: skipButtonRef,
        className: 'md:max-w-xl',
        title: `${t('c:skip')} ${t('c:create_resource', { resource: t('c:organization') }).toLowerCase()}`,
        description: t('c:skip_org_creation.text'),
      });
      return;
    }
    nextStep();
  };

  return (
    <div className="flex w-full gap-2 max-sm:justify-stretch">
      {isOptionalStep && (
        <Button ref={skipButtonRef} onClick={skipStep} variant="secondary" className="max-sm:w-full">
          <RedoIcon />
          {t('c:skip')}
        </Button>
      )}
    </div>
  );
}
