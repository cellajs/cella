import { RedoIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { SkipOrganization, skipOrganizationDialogId } from '~/modules/home/onboarding/skip-organization';
import { Button } from '~/modules/ui/button';

interface SkipStepButtonProps {
  onComplete: () => void;
}

/** Skips an optional step; skipping the organization step asks first, and the confirmed skip ends onboarding through `onComplete`. */
export function SkipStepButton({ onComplete }: SkipStepButtonProps) {
  const { nextStep, isOptionalStep, currentStep } = useStepper();
  const { t } = useTranslation();

  const skipButtonRef = useRef<HTMLButtonElement>(null);

  const skipStep = () => {
    if (currentStep?.id === 'organization') {
      dialoger.getState().create(<SkipOrganization onComplete={onComplete} />, {
        id: skipOrganizationDialogId,
        triggerRef: skipButtonRef,
        className: 'md:max-w-xl',
        title: t('c:skip_org_creation'),
        description: t('c:skip_org_creation.text'),
      });
      return;
    }
    nextStep();
  };

  return (
    <div className="flex w-full">
      {isOptionalStep && (
        <Button ref={skipButtonRef} onClick={skipStep} variant="secondary" className="max-sm:w-full">
          <RedoIcon />
          {t('c:skip')}
        </Button>
      )}
    </div>
  );
}
