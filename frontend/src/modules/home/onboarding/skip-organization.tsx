import { RedoIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmForm } from '~/modules/common/confirm-form';
import { useOverlayClose } from '~/modules/common/overlay-close';

export const skipOrganizationDialogId = 'skip-org-creation';

interface SkipOrganizationProps {
  onComplete: () => void;
}

export function SkipOrganization({ onComplete }: SkipOrganizationProps) {
  const { t } = useTranslation();
  const overlay = useOverlayClose();

  const skip = () => {
    overlay?.close();
    onComplete();
  };

  return <ConfirmForm variant="destructive" icon={RedoIcon} label={t('c:skip')} pending={false} allowOffline onConfirm={skip} />;
}
