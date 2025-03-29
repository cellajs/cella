import { Check, KeyRound, Trash } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

import { deletePasskey, passkeyRegistration } from '~/modules/me/helpers';
import type { UserAuthInfo } from '~/modules/me/types';

const Passkeys = ({ userAuthInfo }: { userAuthInfo: UserAuthInfo }) => {
  const { t } = useTranslation();

  const [hasPasskey, setHasPasskey] = useState(userAuthInfo.passkey);

  const handlePasskeyRegistration = async () => {
    const success = await passkeyRegistration();
    if (success) setHasPasskey(true);
  };

  const handleDeletePasskey = async () => {
    const success = await deletePasskey();
    if (success) setHasPasskey(false);
  };

  return (
    <>
      {hasPasskey && (
        <div className="flex items-center gap-2 mb-6">
          <Check size={18} className="text-success" />
          <span>{t('common:passkey_registered')}</span>
        </div>
      )}
      <div className="flex max-sm:flex-col gap-2 mb-6">
        <Button key="createPasskey" type="button" variant="plain" onClick={handlePasskeyRegistration}>
          <KeyRound className="w-4 h-4 mr-1" />
          {hasPasskey ? t('common:reset_passkey') : `${t('common:add')} ${t('common:new_passkey').toLowerCase()}`}
        </Button>
        {hasPasskey && (
          <Button key="deletePasskey" type="button" variant="ghost" onClick={handleDeletePasskey}>
            <Trash className="w-4 h-4 mr-1" />
            <span>{t('common:remove')}</span>
          </Button>
        )}
      </div>
    </>
  );
};

export default Passkeys;
