import { useSuspenseQuery } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ConfirmDisableMfa, ConfirmMfaOptions } from '~/modules/me/mfa/confirmation';
import { meAuthQueryOptions } from '~/modules/me/query';
import { Switch } from '~/modules/ui/switch';
import { useCurrentUser } from '~/modules/user/user-store';

export const MfaSwitch = () => {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const hasPasskey = authData.passkeys.length > 0;
  const hasTotp = authData.hasTotp;

  const { create: createDialog } = useDialoger();

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleToggleMfa = (mfaRequired: boolean) => {
    const isEnabling = mfaRequired;

    const Dialog = isEnabling ? ConfirmMfaOptions : ConfirmDisableMfa;
    const action = isEnabling ? 'enable' : 'disable';

    createDialog(<Dialog mfaRequired={isEnabling} />, {
      id: 'mfa-confirmation',
      triggerRef,
      className: 'max-w-xl',
      title: t(`c:${action}_resource`, { resource: t('c:mfa_short') }),
      description: t(`c:mfa_${action}_confirmation.text`),
    });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-start">
        <Switch
          id="mfaRequired"
          ref={triggerRef}
          disabled={!hasPasskey || !hasTotp}
          checked={user.mfaRequired}
          onCheckedChange={handleToggleMfa}
        />
        {user.mfaRequired && (
          <p className="flex items-center gap-2">
            <CircleAlertIcon className="icon-sm shrink-0 text-amber-500" />
            <span className="text-muted-foreground text-sm">{t('c:mfa_enabled.text')}</span>
          </p>
        )}
        {(!hasPasskey || !hasTotp) && (
          <p className="flex items-center gap-2">
            <CircleAlertIcon className="icon-sm shrink-0 text-amber-500" />
            <span className="text-muted-foreground text-sm">{t('c:mfa_disabled.text')}</span>
          </p>
        )}
      </div>
    </div>
  );
};
