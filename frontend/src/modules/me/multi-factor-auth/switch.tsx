import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import HelpText from '~/modules/common/help-text';
import { ConfirmDisableMFA } from '~/modules/me/multi-factor-auth/disable-confirmation';
import { useToogleMFAMutation } from '~/modules/me/query';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';

export const MultiFactorAuthentication = () => {
  const { t } = useTranslation();
  const { user, hasPasskey, hasTotp } = useUserStore.getState();

  const { create: createDialog } = useDialoger();

  const { mutateAsync: toggleMFA } = useToogleMFAMutation();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleToggleMFA = (enabled: boolean) => {
    if (enabled) toggleMFA({ multiFactorRequired: true });
    else {
      createDialog(<ConfirmDisableMFA />, {
        id: 'disable-mfa',
        triggerRef,
        className: 'max-w-xl',
        title: t('common:mfa_disable_confirmation.title'),
        description: t('common:mfa_disable_confirmation.text'),
      });
    }
  };
  return (
    <>
      <HelpText content={t('common:mfa.text')}>
        <p className="font-semibold">{t('common:mfa')}</p>
      </HelpText>
      <div className="mb-6">
        {/* TODO make open dialog with TOPT or Passkey creation if none available */}
        <Switch ref={triggerRef} disabled={!hasPasskey || !hasTotp} checked={user.multiFactorRequired} onCheckedChange={handleToggleMFA} />
        {(!hasPasskey || !hasTotp) && <p className="text-sm text-gray-500 mt-2">{t('common:mfa_disabled.text')}</p>}
      </div>
    </>
  );
};
