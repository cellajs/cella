import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { Fingerprint, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/service';
import { PasskeyTile } from '~/modules/me/passkeys/tile';
import { meAuthQueryOptions, useCreatePasskeyMutation, useDeletePasskeyMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

const PasskeysList = () => {
  const { t } = useTranslation();

  const { user, hasPasskey } = useUserStore.getState();

  const { mutate: createPasskey } = useCreatePasskeyMutation();
  const { mutate: deletePasskey, isPending } = useDeletePasskeyMutation();

  const queryOptions = meAuthQueryOptions();
  const {
    data: { passkeys },
  } = useSuspenseQuery(queryOptions);

  const handleUnlinkPasskey = (id: string) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    if (user.mfaRequired && passkeys.length <= 1) return toaster(t('common:unlink_mfa_last', { method: 'the last passkey' }), 'info');
    deletePasskey({ id });
  };
  return (
    <div className="mb-6">
      <div className="flex flex-row max-sm:flex-col">
        <Button key="createPasskey" type="button" variant="plain" onClick={() => createPasskey()}>
          {hasPasskey ? <Plus className="size-4 mr-2" /> : <Fingerprint className="size-4 mr-2" />}
          {hasPasskey
            ? t('common:add_resource', { resource: t('common:passkey').toLowerCase() })
            : t('common:create_resource', { resource: t('common:passkey').toLowerCase() })}
        </Button>
      </div>
      <div className="flex flex-col gap-2 has-first:mt-4">
        <ExpandableList
          items={passkeys}
          renderItem={(passkey) => (
            <PasskeyTile
              passkey={passkey}
              key={passkey.id}
              handleUnlinkPasskey={handleUnlinkPasskey}
              isPending={isPending}
              onlyPasskeyLeft={passkeys.length === 1}
            />
          )}
          initialDisplayCount={3}
          expandText="common:more"
        />
      </div>
    </div>
  );
};

export default PasskeysList;
