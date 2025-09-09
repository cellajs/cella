import { useNavigate, useParams } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/api.gen';
import { MFARoute } from '~/routes/auth';
import { toaster } from '../common/toaster/service';
import { Button } from '../ui/button';
import PasskeyStrategy from './passkey-strategy';
import { TOTPStrategy } from './totp-strategy';

export const MFA = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { email } = useParams({ from: MFARoute.id });

  const handleCancelMFA = async () => {
    try {
      await signOut();
      toaster(t('common:success.signed_out'), 'success');
    } catch (error) {
    } finally {
      navigate({ to: '/about', replace: true });
    }
  };

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:mfa_header')}</h1>

      <Button variant="ghost" onClick={handleCancelMFA} className="mx-auto flex max-w-full truncate font-light sm:text-xl bg-foreground/10">
        <span className="truncate">{email}</span>
        <ChevronDown size={16} className="ml-1" />
      </Button>

      <p className="font-light text-center space-x-1">{t('common:mfa_subheader.text')}</p>

      <PasskeyStrategy type="mfa" />
      <TOTPStrategy />
    </>
  );
};
