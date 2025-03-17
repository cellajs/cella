import { useEffect } from 'react';

import { ArrowLeft, Redo } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useStepper } from '~/modules/common/stepper';
import { onDefaultBoardingSteps } from '~/modules/home/onboarding/onboarding-config';
import { SkipOrganization } from '~/modules/home/onboarding/skip-organization';
import type { Organization } from '~/modules/organizations/types';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';

const StepperFooter = ({
  organization,
}: {
  organization?: Organization | null;
}) => {
  const { nextStep, prevStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();
  const { t } = useTranslation();
  const { menu, setFinishedOnboarding } = useNavigationStore();
  const hasOrganizations = menu.organizations.length > 0;

  // Ask to confirm
  const skipStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (onDefaultBoardingSteps[activeStep].id === 'organization' && !hasOrganizations) {
      useDialoger.getState().create(<SkipOrganization />, {
        className: 'md:max-w-xl',
        title: `${t('common:skip')} ${t('common:create_resource', { resource: t('common:organization') }).toLowerCase()}`,
        description: t('common:skip_org_creation.text'),
        id: 'skip_org_creation',
      });
      return;
    }
    console.log('nextStep', nextStep);
    nextStep();
  };

  // prevent accidental submit
  const backStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    prevStep();
  };

  useEffect(() => {
    if ((activeStep === 2 && organization === null) || hasCompletedAllSteps) setFinishedOnboarding();
  }, [organization, hasCompletedAllSteps]);

  return (
    <div className="w-full flex gap-2 max-sm:justify-stretch">
      {isOptionalStep && (
        <Button onClick={skipStep} variant="secondary" className="max-sm:w-full">
          <Redo size={16} className="mr-2" />
          {t('common:skip')}
        </Button>
      )}
      {activeStep === 1 && !organization && (
        <Button onClick={backStep} variant="secondary" className="max-sm:w-full">
          <ArrowLeft size={16} className="mr-2" />
          {t('common:previous')}
        </Button>
      )}
    </div>
  );
};

export default StepperFooter;
