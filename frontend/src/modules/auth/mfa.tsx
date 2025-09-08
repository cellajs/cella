import { useTranslation } from 'react-i18next';
import PasskeyOption from './passkey-option';
import { TOTPOption } from './totp-option';

export const MFA = () => {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="text-2xl text-center">{t('common:2fa.title')}</h1>

      {/* Option 1: Passkey */}
      <PasskeyOption type="two_factor" />

      {/* Option 2: TOTP */}
      <TOTPOption />
    </>
  );
};
