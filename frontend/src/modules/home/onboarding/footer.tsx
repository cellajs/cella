import { RedoIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useStepper } from '~/modules/common/stepper/stepper';
import { getOnboardingSteps } from '~/modules/home/onboarding/onboarding-config';
import { SkipOrganization } from '~/modules/home/onboarding/skip-organization';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Button } from '~/modules/ui/button';

interface StepperFooterProps {
  setOnboardingState: (newState: Exclude<OnboardingStates, 'start'>) => void;
}

/** Skipping the organization step asks for confirmation; other optional steps skip straight through. */
export function StepperFooter({ setOnboardingState }: StepperFooterProps) {
  const { nextStep, isOptionalStep, activeStep, hasCompletedAllSteps } = useStepper();
  const { t } = useTranslation();

  const skipButtonRef = useRef(null);

  useEffect(() => {
    if (hasCompletedAllSteps) setOnboardingState('completed');
  }, [hasCompletedAllSteps]);

  const skipStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (getOnboardingSteps()[activeStep].id === 'organization') {
      useDialoger.getState().create(<SkipOrganization setOnboardingState={setOnboardingState} />, {
        id: 'skip-org-creation',
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
          <RedoIcon className="mr-2" />
          {t('c:skip')}
        </Button>
      )}
    </div>
  );
}
