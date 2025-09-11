import { useSuspenseQuery } from '@tanstack/react-query';
import { ShieldMinus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ConfirmDisableMfaOptions } from '~/modules/me/mfa/disable-confirmation-options';
import { meAuthQueryOptions } from '~/modules/me/query';
import { Button, SubmitButton } from '~/modules/ui/button';

export const ConfirmDisableMfa = () => {
  const { t } = useTranslation();
  const { remove: removeDialog } = useDialoger();

  const [openConfirmation, setOpenConfirmation] = useState(false);

  const { data: currentSession } = useSuspenseQuery({
    ...meAuthQueryOptions(),
    select: ({ sessions }) =>
      sessions.find(({ isCurrent, type, authStrategy }) => isCurrent && type === 'mfa' && (authStrategy === 'passkey' || authStrategy === 'totp')),
  });

  const handleDisable = useCallback(() => {
    setOpenConfirmation(true);
  }, [currentSession]);

  return (
    <>
      {!openConfirmation && (
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton variant="destructive" onClick={handleDisable} aria-label="Delete">
            <ShieldMinus size={16} className="mr-2" />
            {t('common:disable')}
          </SubmitButton>

          <Button type="reset" variant="secondary" aria-label="Cancel" onClick={() => removeDialog()}>
            {t('common:cancel')}
          </Button>
        </div>
      )}
      {openConfirmation && <ConfirmDisableMfaOptions />}
    </>
  );
};
