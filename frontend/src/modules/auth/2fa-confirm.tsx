import { useTranslation } from 'react-i18next';
import PasskeyOption from '~/modules/auth/passkey-option';
import { TOPTOption } from '~/modules/auth/totp-option';

export const Confirm2FA = () => {
  const { t } = useTranslation();

  return (
    <>
      <h2 className="text-xl font-semibold">Continue Two-Factor Authentication</h2>

      {/* Option 1: Passkey */}
      <PasskeyOption actionType="two_factor" authStep="signIn" />

      <div className="relative flex justify-center text-xs uppercase">
        <span className="text-muted-foreground px-2">{t('common:or')}</span>
      </div>

      {/* Option 2: TOPT */}
      <TOPTOption />
    </>
  );
};
