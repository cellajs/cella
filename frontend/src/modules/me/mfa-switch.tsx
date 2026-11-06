import { useSuspenseQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { MfaConfirmation } from '~/modules/me/mfa-confirmation';
import { meAuthQueryOptions } from '~/modules/me/query';
import { FieldContent, FieldDescription, FieldLabel, FieldLayout, FieldTitle } from '~/modules/ui/field';
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
    <div className="mb-8">
      <FieldLabel htmlFor="mfaRequired" card>
        <FieldLayout orientation="horizontal" data-disabled={!canEnable || undefined}>
          <Switch
            id="mfaRequired"
            ref={triggerRef}
            disabled={!canEnable}
            checked={user.mfaRequired}
            onCheckedChange={handleToggleMfa}
            aria-labelledby="mfaRequired-title"
            aria-describedby={canEnable ? undefined : 'mfaRequired-note'}
            className="data-checked:bg-success"
          />
          <FieldContent>
            <FieldTitle id="mfaRequired-title">{t('c:enable_resource', { resource: t('c:mfa_short') })}</FieldTitle>
            {!canEnable && <FieldDescription id="mfaRequired-note">{t('c:mfa_disabled.text')}</FieldDescription>}
          </FieldContent>
        </FieldLayout>
      </FieldLabel>
    </div>
  );
}
