import { ShieldCheckIcon, ShieldMinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmForm } from '~/modules/common/confirm-form';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { useToggleMfaMutation } from '~/modules/me/query';

interface MfaConfirmationProps {
  /** The setting to switch to: `true` turns MFA on. */
  mfaRequired: boolean;
}

/** Confirms turning MFA on or off; a session that is not stepped up first proves the user's second factor. */
export function MfaConfirmation({ mfaRequired }: MfaConfirmationProps) {
  const { t } = useTranslation();
  const overlay = useOverlayClose();
  const { mutate: toggleMfa, isPending } = useToggleMfaMutation();

  return (
    <ConfirmForm
      variant={mfaRequired ? 'default' : 'destructive'}
      icon={mfaRequired ? ShieldCheckIcon : ShieldMinusIcon}
      label={t(mfaRequired ? 'c:enable_resource' : 'c:disable_resource', { resource: t('c:mfa_short') })}
      pending={isPending}
      onConfirm={() => toggleMfa({ mfaRequired }, { onSuccess: overlay?.close })}
    />
  );
}
