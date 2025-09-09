import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '~/store/user';
import { Button } from '../ui/button';
import PasskeyStrategy from './passkey-strategy';
import { TOTPStrategy } from './totp-strategy';

export const MFA = () => {
  const { t } = useTranslation();

  // TODO this isnt correct state?
  const { lastUser } = useUserStore();
  const email = lastUser?.email || '';

  // TODO reset auth state in store
  const resetAuth = () => {
    console.log('resetAuth');
  };

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:mfa_header')}</h1>

      <Button variant="ghost" onClick={resetAuth} className="mx-auto flex max-w-full truncate font-light sm:text-xl bg-foreground/10">
        <span className="truncate">{email}</span>
        <ChevronDown size={16} className="ml-1" />
      </Button>

      <p className="font-light text-center space-x-1">{t('common:mfa_subheader.text')}</p>

      <PasskeyStrategy type="mfa" />
      <TOTPStrategy />
    </>
  );
};
