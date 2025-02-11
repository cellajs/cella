import { useNavigate, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Fingerprint } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Step } from '~/modules/auth/types';
import { Button } from '~/modules/ui/button';
import { passkeyAuth } from '~/modules/users/helpers';
import { AuthenticateRoute } from '~/routes/auth';
import { useThemeStore } from '~/store/theme';

interface PassKeyOptionProps {
  actionType: Step;
  email: string;
}

// TODO: split passkeyAuth into separate file
const PassKeyOption = ({ email, actionType = 'signIn' }: PassKeyOptionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode } = useThemeStore();

  const { redirect } = useSearch({ from: AuthenticateRoute.id });
  const redirectPath = redirect?.startsWith('/') ? redirect : config.defaultRedirectPath;

  const successCallback = () => {
    navigate({ to: redirectPath, replace: true });
  };

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Button type="button" onClick={() => passkeyAuth(email, successCallback)} variant="plain" className="w-full gap-1.5">
        <Fingerprint size={16} />
        <span>{actionType === 'signIn' ? t('common:sign_in') : t('common:sign_up')}</span>
        <span>{t('common:with').toLowerCase()}</span> <span>{t('common:passkey').toLowerCase()}</span>
      </Button>
    </div>
  );
};

export default PassKeyOption;
