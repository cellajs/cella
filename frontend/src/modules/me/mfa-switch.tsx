import { useSuspenseQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { MfaConfirmation } from '~/modules/me/mfa-confirmation';
import { meAuthQueryOptions } from '~/modules/me/query';
import { WarningNote } from '~/modules/me/warning-note';
import { Label } from '~/modules/ui/label';
import { Switch } from '~/modules/ui/switch';
import { useCurrentUser } from '~/modules/user/user-store';

export function MfaSwitch() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const canEnable = authData.passkeys.length > 0 && authData.totp !== null;

  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleToggleMfa = (mfaRequired: boolean) => {
    const action = mfaRequired ? 'enable' : 'disable';

    dialoger.getState().create(<MfaConfirmation mfaRequired={mfaRequired} />, {
      id: 'mfa-confirmation',
      triggerRef,
      className: 'max-w-xl',
      title: t(`c:${action}_resource`, { resource: t('c:mfa_short') }),
      description: t(`c:confirm.${action}_mfa`),
    });
  };

  return (
    <div className="mb-8 flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Switch id="mfaRequired" ref={triggerRef} disabled={!canEnable} checked={user.mfaRequired} onCheckedChange={handleToggleMfa} />
        <Label htmlFor="mfaRequired">{t('c:enable_resource', { resource: t('c:mfa_short') })}</Label>
      </div>
      {!canEnable && <WarningNote>{t('c:mfa_disabled.text')}</WarningNote>}
    </div>
  );
}
