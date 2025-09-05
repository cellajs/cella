import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { Fingerprint, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/service';
import { PasskeyTile } from '~/modules/me/passkeys/title';
import { meAuthQueryOptions, useRegistratePasskeyMutation, useUnlinkPasskeyMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

const PasskeysList = () => {
  const { t } = useTranslation();

  const { hasPasskey } = useUserStore.getState();

  const { mutate: registratePasskey } = useRegistratePasskeyMutation();
  const { mutate: unlinkPasskey, isPending } = useUnlinkPasskeyMutation();

  const handleUnlinkPasskey = (id: string) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    unlinkPasskey(id);
  };
  const queryOptions = meAuthQueryOptions();
  const {
    data: { passkeys },
  } = useSuspenseQuery(queryOptions);

  return (
    <div className="mb-6">
      <div className="flex flex-row max-sm:flex-col items-center justify-between">
        {hasPasskey && (
          <div className="flex items-center gap-1 p-2.5">
            <Fingerprint className="w-4 h-4 mr-2" />
            <span>{t('common:registered_passkeys')}</span>
          </div>
        )}
        <Button key="registratePasskey" type="button" variant="plain" onClick={() => registratePasskey()}>
          {hasPasskey ? <Plus className="w-4 h-4 mr-2" /> : <Fingerprint className="w-4 h-4 mr-2" />}
          {hasPasskey
            ? t('common:add_resource', { resource: t('common:passkey').toLowerCase() })
            : t('common:create_resource', { resource: t('common:passkey').toLowerCase() })}
        </Button>
      </div>
      <div className="flex flex-col mt-4 gap-2">
        <ExpandableList
          items={passkeys}
          renderItem={(passkey) => <PasskeyTile passkey={passkey} key={passkey.id} handleUnlinkPasskey={handleUnlinkPasskey} isPending={isPending} />}
          initialDisplayCount={3}
          expandText="common:more"
        />
      </div>
    </div>
  );
};

export default PasskeysList;
