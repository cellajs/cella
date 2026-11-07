import { RedoIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmForm } from '~/modules/common/confirm-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { Button } from '~/modules/ui/button';

const skipOrganizationDialogId = 'skip-org-creation';

interface SkipOrganizationProps {
  onComplete: () => void;
}

function SkipOrganization({ onComplete }: SkipOrganizationProps) {
  const { t } = useTranslation();
  const overlay = useOverlayClose();

  const skip = () => {
    overlay?.close();
    onComplete();
  };

  return <ConfirmForm icon={RedoIcon} label={t('c:skip')} pending={false} allowOffline onConfirm={skip} />;
}

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
