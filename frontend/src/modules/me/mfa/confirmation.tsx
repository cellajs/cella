import { ShieldCheckIcon, ShieldMinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useToggleMfaMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';

interface MfaConfirmationProps {
  /** The setting to switch to: `true` turns MFA on. */
  mfaRequired: boolean;
}

/** Confirms turning MFA on or off; a session that is not stepped up first proves the user's second factor. */
export function MfaConfirmation({ mfaRequired }: MfaConfirmationProps) {
  const { t } = useTranslation();
  const { mutate: toggleMfa, isPending } = useToggleMfaMutation();

  const closeDialog = () => dialoger.getState().remove('mfa-confirmation');

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <SubmitButton
        variant={mfaRequired ? 'default' : 'destructive'}
        icon={mfaRequired ? <ShieldCheckIcon /> : <ShieldMinusIcon />}
        loading={isPending}
        onClick={() => toggleMfa({ mfaRequired }, { onSuccess: closeDialog })}
      >
        {t(mfaRequired ? 'c:enable_resource' : 'c:disable_resource', { resource: t('c:mfa_short') })}
      </SubmitButton>
      <Button variant="secondary" onClick={closeDialog}>
        {t('c:cancel')}
      </Button>
    </div>
  );
}
