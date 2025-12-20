import { FingerprintIcon, ShieldMinusIcon, SmartphoneIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPasskeyVerifyCredential } from '~/modules/auth/passkey-credentials';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useToggleMfaMutation } from '~/modules/me/query';
import { Button, SubmitButton } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

export const ConfirmDisableMfa = () => {
  const { t } = useTranslation();
  const { remove: removeDialog } = useDialoger();

  const [openConfirmation, setOpenConfirmation] = useState(false);

  return (
    <>
      {!openConfirmation && (
        <div className="flex flex-col sm:flex-row gap-2">
          <SubmitButton variant="destructive" onClick={() => setOpenConfirmation(true)} aria-label={'disable'}>
            {<ShieldMinusIcon size={16} className="mr-2" />}
            {t(`common:disable`)}
          </SubmitButton>

          <Button type="reset" variant="secondary" aria-label="Cancel" onClick={() => removeDialog()}>
            {t('common:cancel')}
          </Button>
        </div>
      )}
      {openConfirmation && <ConfirmMfaOptions mfaRequired={false} />}
    </>
  );
};

export const ConfirmMfaOptions = ({ mfaRequired }: { mfaRequired: boolean }) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const { remove: removeDialog } = useDialoger();

  const { mutateAsync: toggleMfa } = useToggleMfaMutation();

  const totpTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);

  const onPasskyConfirm = async () => {
    const passkeyData = await getPasskeyVerifyCredential({ email: user.email, type: 'authentication' });
    toggleMfa({ mfaRequired, passkeyData });
    removeDialog();
  };

  const onTotpConfirm = async ({ code: totpCode }: { code: string }) => {
    await toggleMfa({ mfaRequired, totpCode });
    removeDialog();
  };

  return (
    <>
      {!isOpen && (
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => onPasskyConfirm()} variant="plain" className="w-full gap-1.5 truncate">
            <FingerprintIcon size={16} />
            <span className="truncate">
              {t('common:confirm')} {t('common:with').toLowerCase()} {t('common:passkey').toLowerCase()}
            </span>
          </Button>
          <Button
            ref={totpTriggerRef}
            type="button"
            onClick={() => setIsOpen(true)}
            variant="plain"
            className="w-full gap-1.5 truncate"
          >
            <SmartphoneIcon size={16} />
            <span className="truncate">
              {t('common:confirm')} {t('common:with').toLowerCase()} {t('common:authenticator_app').toLowerCase()}
            </span>
          </Button>
        </div>
      )}

      {isOpen && (
        <TotpConfirmationForm
          onSubmit={onTotpConfirm}
          onCancel={() => useDialoger.getState().remove('mfa-confirmation')}
          label={t('common:totp_verify')}
        />
      )}
    </>
  );
};
