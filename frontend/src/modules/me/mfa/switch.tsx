import { useSuspenseQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { MfaConfirmation } from '~/modules/me/mfa/confirmation';
import { meAuthQueryOptions } from '~/modules/me/query';
import { WarningNote } from '~/modules/me/warning-note';
import { Switch } from '~/modules/ui/switch';
import { useCurrentUser } from '~/modules/user/user-store';

export function MfaSwitch() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const canEnable = authData.passkeys.length > 0 && authData.hasTotp;

  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleToggleMfa = (mfaRequired: boolean) => {
    const action = mfaRequired ? 'enable' : 'disable';

    dialoger.getState().create(<MfaConfirmation mfaRequired={mfaRequired} />, {
      id: 'mfa-confirmation',
      triggerRef,
      className: 'max-w-xl',
      title: t(`c:${action}_resource`, { resource: t('c:mfa_short') }),
      description: t(`c:mfa_${action}_confirmation.text`),
    });
  };

  return (
    <div className="mb-6 flex items-center gap-4 max-sm:flex-col max-sm:items-start">
      <Switch
        id="mfaRequired"
        ref={triggerRef}
        aria-label={t('c:mfa')}
        disabled={!canEnable}
        checked={user.mfaRequired}
        onCheckedChange={handleToggleMfa}
      />
      {user.mfaRequired && <WarningNote>{t('c:mfa_enabled.text')}</WarningNote>}
      {!canEnable && <WarningNote>{t('c:mfa_disabled.text')}</WarningNote>}
    </div>
  );
}
