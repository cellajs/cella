import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { FingerprintPatternIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/toaster';
import { PasskeyTile } from '~/modules/me/passkeys/tile';
import { meAuthQueryOptions, useCreatePasskeyMutation, useDeletePasskeyMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';

export function PasskeysList() {
  const { t } = useTranslation();

  const user = useCurrentUser();

  const { mutate: createPasskey } = useCreatePasskeyMutation();
  const { mutate: deletePasskey, isPending } = useDeletePasskeyMutation();

  const {
    data: { passkeys },
  } = useSuspenseQuery(meAuthQueryOptions());
  const hasPasskey = passkeys.length > 0;

  const handleUnlinkPasskey = (id: string) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    if (user.mfaRequired && passkeys.length <= 1)
      return toaster.info(t('c:unlink_mfa_last', { method: 'the last passkey' }));
    deletePasskey({ path: { id } });
  };
  return (
    <div className="mb-6">
      <div className="flex flex-row max-sm:flex-col">
        <Button key="createPasskey" type="button" variant="plain" onClick={() => createPasskey()}>
          {hasPasskey ? <PlusIcon className="mr-2 size-4" /> : <FingerprintPatternIcon className="mr-2 size-4" />}
          {hasPasskey
            ? t('c:add_resource', { resource: t('c:passkey').toLowerCase() })
            : t('c:create_resource', { resource: t('c:passkey').toLowerCase() })}
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
          expandText="c:more"
        />
      </div>
    </div>
  );
}
