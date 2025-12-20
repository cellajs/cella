import { RedoIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useStepper } from '~/modules/common/stepper';
import { onboardingSteps } from '~/modules/home/onboarding/onboarding-config';
import { SkipOrganization } from '~/modules/home/onboarding/skip-organization';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Button } from '~/modules/ui/button';

const StepperFooter = ({
  setOnboardingState,
}: {
  setOnboardingState: (newState: Exclude<OnboardingStates, 'start'>) => void;
}) => {
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
        title: `${t('common:skip')} ${t('common:create_resource', { resource: t('common:organization') }).toLowerCase()}`,
        description: t('common:skip_org_creation.text'),
      });
      return;
    }
    nextStep();
  };

  return (
    <div className="w-full flex gap-2 max-sm:justify-stretch">
      {isOptionalStep && (
        <Button ref={skipButtonRef} onClick={skipStep} variant="secondary" className="max-sm:w-full">
          <RedoIcon size={16} className="mr-2" />
          {t('common:skip')}
        </Button>
      )}
    </div>
  );
};

export default StepperFooter;
