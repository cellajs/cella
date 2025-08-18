import { useTranslation } from 'react-i18next';
import { useUserStore } from '~/store/user';
import HelpText from '../common/help-text';
import { Switch } from '../ui/switch';
import type { MeAuthData } from './types';

export const TwoFactorAuthentication = ({ userAuthData }: { userAuthData: MeAuthData }) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const { hasPasskey, enabledOAuth } = userAuthData;
  const disabled = !hasPasskey && enabledOAuth.length === 0;

  return (
    <>
      <HelpText content={t('common:2fa.text')}>
        <p className="font-semibold">{t('common:2fa')}</p>{' '}
      </HelpText>
      <div className="mb-6">
        <Switch
          checked={false}
          onCheckedChange={() => {
            console.log('Toggle 2FA', user);
          }}
        />
        {disabled && <p className="text-sm text-gray-500 mt-2">{t('common:2fa_disabled.text')}</p>}
      </div>
    </>
  );
};
