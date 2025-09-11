import { CircleAlert } from 'lucide-react';
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

  // TODO what if the request fails, will it revert the switch?
  const { mutateAsync: toggleMfa } = useToggleMfaMutation();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleToggleMfa = (activate: boolean) => {
    if (activate) toggleMfa({ mfaRequired: true });
    else {
      createDialog(<ConfirmDisableMfa />, {
        id: 'mfa-confirmation',
        triggerRef,
        className: 'max-w-xl',
        title: t('common:disable_resource', { resource: t('common:mfa_short') }),
        description: t('common:mfa_disable_confirmation.text'),
      });
    }
  };
  return (
    <div className="mb-6">
      <div className="flex items-center gap-4">
        <Switch id="mfaRequired" ref={triggerRef} disabled={!hasPasskey || !hasTotp} checked={user.mfaRequired} onCheckedChange={handleToggleMfa} />
        {user.mfaRequired && (
          <p className="flex gap-2 items-center">
            <CircleAlert size={12} className="text-amber-500" />
            <span className="text-sm text-muted-foreground font-light">{t('common:mfa_enabled.text')}</span>
          </p>
        )}
        {(!hasPasskey || !hasTotp) && (
          <p className="flex gap-2 items-center">
            <CircleAlert size={12} className="text-amber-500" />
            <span className="text-sm text-muted-foreground font-light">{t('common:mfa_disabled.text')}</span>
          </p>
        )}
      </div>
    </div>
  );
};
