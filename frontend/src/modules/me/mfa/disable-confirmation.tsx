import { useSuspenseQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ShieldMinus } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ConfirmDisableMfaOptions } from '~/modules/me/mfa/disable-confirmation-options';
import { meAuthQueryOptions, useToggleMfaMutation } from '~/modules/me/query';
import { Button, SubmitButton } from '~/modules/ui/button';

export const ConfirmDisableMfa = () => {
  const { t } = useTranslation();
  const { create: createDialog, remove: removeDialog } = useDialoger();

  const { mutateAsync: toggleMfa, isPending } = useToggleMfaMutation();

  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);

  const { data: currentSession } = useSuspenseQuery({
    ...meAuthQueryOptions(),
    select: ({ sessions }) =>
      sessions.find(({ isCurrent, type, authStrategy }) => isCurrent && type === 'mfa' && (authStrategy === 'passkey' || authStrategy === 'totp')),
  });

  const handleDisable = useCallback(() => {
    const oneHourAgo = dayjs().subtract(1, 'hour'); // 1 h ago timestamp

    // If no current session OR session too old -> require confirmation
    if (!currentSession || dayjs.utc(currentSession.createdAt).local().isBefore(oneHourAgo)) {
      createDialog(<ConfirmDisableMfaOptions />, {
        id: 'confirmation-disable-mfa',
        className: 'max-w-xl',
        title: t('common:mfa_disable_confirmation.title'),
        description: t('common:mfa_disable_confirmation.text'),
        triggerRef: confirmationTriggerRef,
      });
      return;
    }

    // Else -> disable MFA immediately
    toggleMfa({ mfaRequired: false });
  }, [currentSession]);

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <SubmitButton ref={confirmationTriggerRef} variant="destructive" onClick={handleDisable} aria-label="Delete" loading={isPending}>
        <ShieldMinus size={16} className="mr-2" />
        {t('common:disable')}
      </SubmitButton>
      <Button type="reset" variant="secondary" aria-label="Cancel" onClick={() => removeDialog()}>
        {t('common:cancel')}
      </Button>
    </div>
  );
};
