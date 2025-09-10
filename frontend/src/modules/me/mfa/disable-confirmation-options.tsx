import { Fingerprint, Smartphone } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getPasskeyVerifyCredential } from '~/modules/auth/passkey-credentials';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useToggleMfaMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

export const ConfirmDisableMfaOptions = () => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const { remove: removeDialog } = useDialoger();

  const { mutateAsync: toggleMfa } = useToggleMfaMutation();

  const totpTriggerRef = useRef<HTMLButtonElement | null>(null);

  const onPasskyConfirm = async () => {
    const passkeyData = await getPasskeyVerifyCredential({ email: user.email, type: 'authentication' });
    toggleMfa({ mfaRequired: false, passkeyData });
    removeDialog();
  };

  const onTotpConfirm = async ({ code: totpCode }: { code: string }) => {
    await toggleMfa({ mfaRequired: false, totpCode });
    removeDialog();
  };

  const openTotpVerify = () => {
    useDialoger.getState().create(<TotpConfirmationForm onSubmit={onTotpConfirm} />, {
      id: 'mfa-verification',
      className: 'sm:max-w-md p-6',
      title: t('common:totp_verify'),
      drawerOnMobile: false,
      hideClose: false,
      triggerRef: totpTriggerRef,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={() => onPasskyConfirm()} variant="plain" className="w-full gap-1.5 truncate">
        <Fingerprint size={16} />
        <span className="truncate">
          {t('common:confirm')} {t('common:with').toLowerCase()} {t('common:passkey').toLowerCase()}
        </span>
      </Button>
      <Button ref={totpTriggerRef} type="button" onClick={openTotpVerify} variant="plain" className="w-full gap-1.5 truncate">
        <Smartphone size={16} />
        <span className="truncate">
          {t('common:confirm')} {t('common:with').toLowerCase()} {t('common:authenticator_app').toLowerCase()}
        </span>
      </Button>
    </div>
  );
};
