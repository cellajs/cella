import { RedoIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useStepper } from '~/modules/common/stepper/stepper';
import { onboardingSteps } from '~/modules/home/onboarding/onboarding-config';
import { SkipOrganization } from '~/modules/home/onboarding/skip-organization';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Button } from '~/modules/ui/button';

interface StepperFooterProps {
  setOnboardingState: (newState: Exclude<OnboardingStates, 'start'>) => void;
}

/**
 * Footer for onboarding stepper. Renders a skip button on optional steps
 * and prompts confirmation when skipping organization creation.
 */
export function StepperFooter({ setOnboardingState }: StepperFooterProps) {
  const { nextStep, isOptionalStep, activeStep, hasCompletedAllSteps } = useStepper();
  const { t } = useTranslation();

  const skipButtonRef = useRef(null);

  useEffect(() => {
    if (hasCompletedAllSteps) setOnboardingState('completed');
  }, [hasCompletedAllSteps]);

  // Ask to confirm
  const skipStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (onboardingSteps[activeStep].id === 'organization') {
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
          <RedoIcon size={16} className="mr-2" />
          {t('c:skip')}
        </Button>
      )}
    </div>
  );
}
