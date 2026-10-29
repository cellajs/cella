import { useSuspenseQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { MfaConfirmation } from '~/modules/me/mfa-confirmation';
import { meAuthQueryOptions } from '~/modules/me/query';
import { WarningNote } from '~/modules/me/warning-note';
import { FieldContent, FieldLabel, FieldLayout, FieldTitle } from '~/modules/ui/field';
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

  // A wide card keeps the note beside the title at button height; a narrow one stacks it below.
  return (
    <div className="@container mb-8">
      <FieldLabel htmlFor="mfaRequired" card className="@xl:*:data-[slot=field]:py-2">
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
          <FieldContent className="@xl:flex-row @xl:items-center @xl:justify-between @xl:gap-4">
            <FieldTitle id="mfaRequired-title">{t('c:enable_resource', { resource: t('c:mfa_short') })}</FieldTitle>
            {!canEnable && (
              <WarningNote id="mfaRequired-note" data-slot="field-description">
                {t('c:mfa_disabled.text')}
              </WarningNote>
            )}
          </FieldContent>
        </FieldLayout>
      </FieldLabel>
    </div>
  );
}
