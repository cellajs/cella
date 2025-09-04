import { onlineManager } from '@tanstack/react-query';
import { Check, Fingerprint, RotateCw, Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster/service';
import { passkeyRegistration } from '~/modules/me/helpers';
import { useUnlinkPasskeyMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

const Passkeys = () => {
  const { t } = useTranslation();
  const { hasPasskey, setMeAuthData } = useUserStore.getState();

  const { mutate: unlinkPasskey } = useUnlinkPasskeyMutation();

  const handlePasskeyRegistration = async () => {
    const success = await passkeyRegistration();
    if (success) setMeAuthData({ hasPasskey: true });
  };

  const handleUnlinkPasskey = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    unlinkPasskey();
  };

  return (
    <>
      {hasPasskey && (
        <div className="flex items-center gap-2 mb-6 px-3">
          <Fingerprint className="w-4 h-4 mr-2" />
          <Check size={18} strokeWidth={3} className="text-success" />
          <span>{t('common:passkey_registered')}</span>
        </div>
      )}
      <div className="flex max-sm:flex-col gap-2 mb-6">
        <Button key="registratePasskey" type="button" variant="plain" onClick={handlePasskeyRegistration}>
          {hasPasskey ? <RotateCw className="w-4 h-4 mr-2" /> : <Fingerprint className="w-4 h-4 mr-2" />}
          {hasPasskey
            ? t('common:reset_resource', { resource: t('common:passkey').toLowerCase() })
            : t('common:create_resource', { resource: t('common:passkey').toLowerCase() })}
        </Button>
        {hasPasskey && (
          <Button key="unlinkPasskey" type="button" variant="ghost" onClick={handleUnlinkPasskey}>
            <Trash className="w-4 h-4 mr-2" />
            <span>{t('common:unlink')}</span>
          </Button>
        )}
      </div>
    </>
  );
};

export default Passkeys;
