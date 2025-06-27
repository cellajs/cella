import { onlineManager } from '@tanstack/react-query';
import { Check, Fingerprint, RotateCw, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster';
import { passkeyRegistration } from '~/modules/me/helpers';
import type { MeAuthData } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { deletePasskey } from '~/openapi-client';
import { useUserStore } from '~/store/user';

const Passkeys = ({ userAuthInfo }: { userAuthInfo: MeAuthData }) => {
  const { t } = useTranslation();

  const [hasPasskey, setHasPasskey] = useState(userAuthInfo.passkey);

  const handlePasskeyRegistration = async () => {
    const success = await passkeyRegistration();
    if (success) setHasPasskey(true);
  };

  /**
   * Deletes an existing passkey for current user.
   *
   * @throws Error if there is an issue with removing the passkey.
   * @returns True if the passkey was successfully removed, otherwise false.
   */
  const handleDeletePasskey = async () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    // TODO use react-query for consistency in error handling and code?
    try {
      const result = await deletePasskey();
      if (!result) return toaster(t('error:passkey_remove_failed'), 'error');

      // Success
      setHasPasskey(false);
      toaster(t('common:success.passkey_removed'), 'success');
      useUserStore.getState().setMeAuthData({ passkey: false });
    } catch (error) {
      console.error('Error removing passkey:', error);
      toaster(t('error:passkey_remove_failed'), 'error');
      return false;
    }
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
