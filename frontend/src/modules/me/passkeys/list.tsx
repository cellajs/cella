import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { FingerprintPatternIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { AuthSectionTitle } from '~/modules/me/auth-section-title';
import { PasskeyTile } from '~/modules/me/passkeys/tile';
import { meAuthQueryOptions, useCreatePasskeyMutation, useDeletePasskeyMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';

/** The passkeys section: a create button while there are none, else the list with an add button in its heading. */
export function PasskeysList() {
  const { t } = useTranslation();

  const { mutate: createPasskey } = useCreatePasskeyMutation();
  const { mutate: deletePasskey, isPending, variables } = useDeletePasskeyMutation();

  const {
    data: { passkeys },
  } = useSuspenseQuery(meAuthQueryOptions());
  const resource = t('c:passkey').toLowerCase();

  const handleDeletePasskey = (id: string) => {
    if (!onlineManager.isOnline()) return toastOffline();
    deletePasskey({ path: { id } });
  };

  return (
    <>
      <AuthSectionTitle
        title={t('c:passkeys')}
        help={t('c:passkey.text')}
        action={
          passkeys.length > 0 && (
            <Button className="-mr-2" variant="ghost" size="sm" onClick={() => createPasskey()}>
              <PlusIcon />
              {t('c:add_resource', { resource })}
            </Button>
          )
        }
      />
      <div className="mb-6">
        {passkeys.length > 0 ? (
          <div className="flex flex-col gap-2">
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
            />
          </div>
        ) : (
          <Button className="max-sm:w-full" variant="plain" onClick={() => createPasskey()}>
            <FingerprintPatternIcon />
            {t('c:create_resource', { resource })}
          </Button>
        )}
      </div>
    </>
  );
}
