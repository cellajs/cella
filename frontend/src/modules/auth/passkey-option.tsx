import { useNavigate, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Fingerprint } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Step } from '~/modules/auth/types';
import { passkeyAuth } from '~/modules/me/helpers';
import { Button } from '~/modules/ui/button';
import { AuthenticateRoute } from '~/routes/auth';
import { useUIStore } from '~/store/ui';

interface PasskeyOptionProps {
  actionType: Step;
  email: string;
}

const PasskeyOption = ({ email, actionType = 'signIn' }: PasskeyOptionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = useUIStore((state) => state.mode);

  const { redirect } = useSearch({ from: AuthenticateRoute.id });
  const redirectPath = redirect?.startsWith('/') ? redirect : config.defaultRedirectPath;

  const successCallback = () => {
    navigate({ to: redirectPath, replace: true });
  };

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Button type="button" onClick={() => passkeyAuth(email, successCallback)} variant="plain" className="w-full gap-1.5">
        <Fingerprint size={16} />
        <span>
          {actionType === 'signIn' ? t('common:sign_in') : t('common:sign_up')} {t('common:with').toLowerCase()} {t('common:passkey').toLowerCase()}
        </span>
      </Button>
    </div>
  );
};

export default PasskeyOption;
