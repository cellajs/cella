import { useTranslation } from 'react-i18next';
import HelpText from '~/modules/common/help-text';
import { useUpdateSelfMutation } from '~/modules/me/query';
import type { MeAuthData } from '~/modules/me/types';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';

export const TwoFactorAuthentication = ({ userAuthData }: { userAuthData: MeAuthData }) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  // TODO add success toast for disabling and enabling 2FA
  const { mutateAsync: toggle2fa } = useUpdateSelfMutation();

  const { hasPasskey } = userAuthData;

  return (
    <>
      <HelpText content={t('common:2fa.text')}>
        <p className="font-semibold">{t('common:2fa')}</p>
      </HelpText>
      <div className="mb-6">
        <Switch disabled={!hasPasskey} checked={user.twoFactorEnabled} onCheckedChange={(twoFactorEnabled) => toggle2fa({ twoFactorEnabled })} />
        {!hasPasskey && <p className="text-sm text-gray-500 mt-2">{t('common:2fa_disabled.text')}</p>}
      </div>
    </>
  );
};
