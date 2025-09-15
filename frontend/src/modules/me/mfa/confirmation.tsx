import { ShieldMinus, ShieldPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { ConfirmMfaOptions } from '~/modules/me/mfa/confirmation-options';
import { Button, SubmitButton } from '~/modules/ui/button';

export const ConfirmMfa = ({ mfaRequired }: { mfaRequired: boolean }) => {
  const { t } = useTranslation();
  const { remove: removeDialog } = useDialoger();

  const [openConfirmation, setOpenConfirmation] = useState(false);

  return (
    <>
      {!openConfirmation && (
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton
            variant={mfaRequired ? 'darkSuccess' : 'destructive'}
            onClick={() => setOpenConfirmation(true)}
            aria-label={mfaRequired ? 'Enable' : 'disable'}
          >
            {mfaRequired ? <ShieldPlus size={16} className="mr-2" /> : <ShieldMinus size={16} className="mr-2" />}
            {t(`common:${mfaRequired ? 'enable' : 'disable'}`)}
          </SubmitButton>

          <Button type="reset" variant="secondary" aria-label="Cancel" onClick={() => removeDialog()}>
            {t('common:cancel')}
          </Button>
        </div>
      )}
      {openConfirmation && <ConfirmMfaOptions mfaRequired={mfaRequired} />}
    </>
  );
};
