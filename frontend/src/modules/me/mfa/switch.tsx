import { CircleAlert } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ConfirmMfa } from '~/modules/me/mfa/confirmation';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';

export const MfaSwitch = () => {
  const { t } = useTranslation();
  const { user, hasPasskey, hasTotp } = useUserStore.getState();

  const { create: createDialog } = useDialoger();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleToggleMfa = (mfaRequired: boolean) => {
    createDialog(<ConfirmMfa mfaRequired={mfaRequired} />, {
      id: 'mfa-confirmation',
      triggerRef,
      className: 'max-w-xl',
      title: t('common:disable_resource', { resource: t('common:mfa_short') }),
      description: t('common:mfa_disable_confirmation.text'),
    });
  };
  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-start">
        <Switch id="mfaRequired" ref={triggerRef} disabled={!hasPasskey || !hasTotp} checked={user.mfaRequired} onCheckedChange={handleToggleMfa} />
        {user.mfaRequired && (
          <p className="flex gap-2 items-center">
            <CircleAlert size={14} className="shrink-0 text-amber-500" />
            <span className="text-sm text-muted-foreground font-light">{t('common:mfa_enabled.text')}</span>
          </p>
        )}
        {(!hasPasskey || !hasTotp) && (
          <p className="flex gap-2 items-center">
            <CircleAlert size={14} className="shrink-0 text-amber-500" />
            <span className="text-sm text-muted-foreground font-light">{t('common:mfa_disabled.text')}</span>
          </p>
        )}
      </div>
    </div>
  );
};
