import { onlineManager } from '@tanstack/react-query';
import { Check, Fingerprint, RotateCw, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster/service';
import { passkeyRegistration } from '~/modules/me/helpers';
import { useDeletePasskeyMutation } from '~/modules/me/query';
import type { MeAuthData } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';

const Passkeys = ({ userAuthData }: { userAuthData: MeAuthData }) => {
  const { t } = useTranslation();

  const [hasPasskey, setHasPasskey] = useState(userAuthData.hasPasskey);

  const { mutate: deletePasskey } = useDeletePasskeyMutation();

  const handlePasskeyRegistration = async () => {
    const success = await passkeyRegistration();
    if (success) setHasPasskey(true);
  };

  const handleDeletePasskey = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    deletePasskey(void 0, { onSuccess: () => setHasPasskey(false) });
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
        <Button key="createPasskey" type="button" variant="plain" onClick={handlePasskeyRegistration}>
          {hasPasskey ? <RotateCw className="w-4 h-4 mr-2" /> : <Fingerprint className="w-4 h-4 mr-2" />}
          {hasPasskey ? t('common:reset_passkey') : t('common:create_resource', { resource: t('common:passkey').toLowerCase() })}
        </Button>
        {hasPasskey && (
          <Button key="deletePasskey" type="button" variant="ghost" onClick={handleDeletePasskey}>
            <Trash className="w-4 h-4 mr-2" />
            <span>{t('common:remove')}</span>
          </Button>
        )}
      </div>
    </>
  );
};

export default Passkeys;
