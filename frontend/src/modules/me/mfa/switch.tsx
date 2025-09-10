import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ConfirmDisableMfa } from '~/modules/me/mfa/disable-confirmation';
import { useToggleMfaMutation } from '~/modules/me/query';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';

export const MfaSwitch = () => {
  const { t } = useTranslation();
  const { user, hasPasskey, hasTotp } = useUserStore.getState();

  const { create: createDialog } = useDialoger();

  const { mutateAsync: toggleMfa } = useToggleMfaMutation();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleToggleMfa = (enabled: boolean) => {
    if (enabled) toggleMfa({ mfaRequired: true });
    else {
      createDialog(<ConfirmDisableMfa />, {
        id: 'disable-mfa',
        triggerRef,
        className: 'max-w-xl',
        // TODO perhaps use a translation' disable resource' here
        title: t('common:mfa_disable_confirmation.title'),
        description: t('common:mfa_disable_confirmation.text'),
      });
    }
  };
  return (
    <div className="mb-6">
      {/* TODO make open dialog with TOPT or Passkey creation if none available */}
      <Switch ref={triggerRef} disabled={!hasPasskey || !hasTotp} checked={user.mfaRequired} onCheckedChange={handleToggleMfa} />
      {(!hasPasskey || !hasTotp) && <p className="text-sm text-gray-500 mt-2">{t('common:mfa_disabled.text')}</p>}
    </div>
  );
};
