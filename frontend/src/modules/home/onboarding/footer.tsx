import { useEffect } from 'react';

import { ArrowLeft, Redo } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dialog } from '~/modules/common/dialoger/state';
import { useStepper } from '~/modules/common/stepper';
import { useNavigationStore } from '~/store/navigation';
import type { Organization } from '~/types';
import { type OnboardingStates, onDefaultBoardingSteps } from '.';
import { Button } from '../../ui/button';
import { SkipOrganizationCreation } from './skipOrganizationCreation';

interface StepperFooterProps {
  organization?: Organization | null;
  setOnboarding: (value: OnboardingStates) => void;
}

const StepperFooter = ({ organization, setOnboarding }: StepperFooterProps) => {
  const { nextStep, prevStep, isOptionalStep, hasCompletedAllSteps, activeStep } = useStepper();
  const { t } = useTranslation();
  const { menu } = useNavigationStore();
  const haveOrganizations = menu.organizations.items.length > 0;

  // prevent accidental submit
  const skipStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (onDefaultBoardingSteps[activeStep].id === 'organization' && !haveOrganizations) {
      dialog(<SkipOrganizationCreation />, {
        className: 'md:max-w-xl',
        title: `${t('common:skip')} ${t('common:create_resource', { resource: t('common:organization') }).toLowerCase()}`,
        text: t('common:skip_org_creation.text'),
        id: 'skip_org_creation',
      });
      return;
    }
    nextStep();
  };

  // prevent accidental submit
  const backStep = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    prevStep();
  };

  useEffect(() => {
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
