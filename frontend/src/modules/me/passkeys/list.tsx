import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { FingerprintPatternIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { PasskeyTile } from '~/modules/me/passkeys/tile';
import { meAuthQueryOptions, useCreatePasskeyMutation, useDeletePasskeyMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';

export function PasskeysList() {
  const { t } = useTranslation();

  const { mutate: createPasskey } = useCreatePasskeyMutation();
  const { mutate: deletePasskey, isPending, variables } = useDeletePasskeyMutation();

  const {
    data: { passkeys },
  } = useSuspenseQuery(meAuthQueryOptions());
  const hasPasskey = passkeys.length > 0;

  const handleDeletePasskey = (id: string) => {
    if (!onlineManager.isOnline()) return toastOffline();
    deletePasskey({ path: { id } });
  };

  return (
    <div className="mb-6">
      <Button className="max-sm:w-full" variant="plain" onClick={() => createPasskey()}>
        {hasPasskey ? <PlusIcon /> : <FingerprintPatternIcon />}
        {t(hasPasskey ? 'c:add_resource' : 'c:create_resource', { resource: t('c:passkey').toLowerCase() })}
      </Button>
      <div className="flex flex-col gap-2 has-first:mt-4">
        <ExpandableList
          items={passkeys}
          renderItem={(passkey) => (
            <PasskeyTile
              passkey={passkey}
              key={passkey.id}
              onDelete={handleDeletePasskey}
              loading={isPending && variables?.path.id === passkey.id}
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
