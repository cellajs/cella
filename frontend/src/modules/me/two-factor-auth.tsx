import { useTranslation } from 'react-i18next';
import HelpText from '~/modules/common/help-text';
import { toaster } from '~/modules/common/toaster/service';
import { useUpdateSelfMutation } from '~/modules/me/query';
import type { MeAuthData } from '~/modules/me/types';
import { Switch } from '~/modules/ui/switch';
import { useUserStore } from '~/store/user';

export const TwoFactorAuthentication = ({ userAuthData }: { userAuthData: MeAuthData }) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const { mutateAsync: updateSelf } = useUpdateSelfMutation();

  const { hasPasskey } = userAuthData;

  const toogle2fa = (twoFactorEnabled: boolean) => {
    updateSelf(
      { twoFactorEnabled },
      {
        onSuccess: () => {
          const message = t(`2fa_${twoFactorEnabled ? 'enabled' : 'disabled'}`);
          toaster(message, 'info');
        },
      },
    );
  };
  return (
    <>
      <HelpText content={t('common:2fa.text')}>
        <p className="font-semibold">{t('common:2fa')}</p>
      </HelpText>
      <div className="mb-6">
        <Switch disabled={!hasPasskey} checked={user.twoFactorEnabled} onCheckedChange={toogle2fa} />
        {!hasPasskey && <p className="text-sm text-gray-500 mt-2">{t('common:2fa_disabled.text')}</p>}
      </div>
    </>
  );
};
