import { Redo } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useStepper } from '~/modules/common/stepper';
import { onboardingSteps } from '~/modules/home/onboarding/onboarding-config';
import { SkipOrganization } from '~/modules/home/onboarding/skip-organization';
import type { Organization } from '~/modules/organizations/types';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';

const StepperFooter = ({
  organization,
}: {
  organization?: Organization | null;
}) => {
  const { nextStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();
  const { t } = useTranslation();
  const { menu, setFinishedOnboarding } = useNavigationStore();
  const hasOrganizations = menu.organizations.length > 0;

  const skipButtonRef = useRef(null);

  // Ask to confirm
  const skipStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (onboardingSteps[activeStep].id === 'organization' && !hasOrganizations) {
      useDialoger.getState().create(<SkipOrganization />, {
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

  useEffect(() => {
    if ((activeStep === 2 && organization === null) || hasCompletedAllSteps) setFinishedOnboarding();
  }, [organization, hasCompletedAllSteps]);

  return (
    <div className="w-full flex gap-2 max-sm:justify-stretch">
      {isOptionalStep && (
        <Button ref={skipButtonRef} onClick={skipStep} variant="secondary" className="max-sm:w-full">
          <Redo size={16} className="mr-1" />
          {t('common:skip')}
        </Button>
      )}
    </div>
  );
};

export default StepperFooter;
