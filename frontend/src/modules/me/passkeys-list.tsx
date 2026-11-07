import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { FingerprintPatternIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { HelpText } from '~/modules/common/help-text';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { DeviceTile } from '~/modules/me/device-tile';
import { meAuthQueryOptions, useCreatePasskeyMutation, useDeletePasskeyMutation } from '~/modules/me/query';
import type { Passkey } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';
import { dateShort } from '~/utils/date-short';

interface PasskeyTileProps {
  passkey: Passkey;
  onDelete: (id: string) => void;
  /** This passkey's delete is running. */
  loading: boolean;
  onlyPasskeyLeft: boolean;
}

function PasskeyTile({ passkey, onDelete, loading, onlyPasskeyLeft }: PasskeyTileProps) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  // The backend keeps the last passkey while MFA is on
  const locked = user.mfaRequired && onlyPasskeyLeft;

  return (
    <DeviceTile
      value={passkey.id}
      device={passkey}
      iconBadge={FingerprintPatternIcon}
      meta={passkey.nameOnDevice}
      details={<ExpandableTileDetail label={t('c:created_at')}>{dateShort(passkey.createdAt)}</ExpandableTileDetail>}
      actions={
        <>
          <Button variant="secondary" size="sm" className="max-sm:w-full" loading={loading} disabled={locked} onClick={() => onDelete(passkey.id)}>
            <TrashIcon />
            {t('c:delete')}
          </Button>
          {locked && <p className="text-muted-foreground text-sm">{t('c:passkey_locked.text')}</p>}
        </>
      }
    />
  );
}

/** The passkeys section: a create button while there are none, else the list with an add button in its heading. */
export function PasskeysList() {
  const { t } = useTranslation();

  const { mutate: createPasskey } = useCreatePasskeyMutation();
  const { mutate: deletePasskey, isPending, variables } = useDeletePasskeyMutation();

  const passkeys = useSuspenseQuery(meAuthQueryOptions()).data.passkeys;
  const resource = t('c:passkey');

  const handleDeletePasskey = (id: string) => {
    if (!onlineManager.isOnline()) return toastOffline();
    deletePasskey({ path: { id } });
  };

  return (
    <>
      <HelpText
        content={t('c:passkey.text')}
        className="mb-3"
        action={
          passkeys.length > 0 && (
            <Button className="-mr-2" variant="ghost" size="sm" onClick={() => createPasskey()}>
              <PlusIcon />
              {t('c:add_resource', { resource })}
            </Button>
          )
        }
      >
        <h3 className="group-label">{t('c:passkeys')}</h3>
      </HelpText>
      <div className="mb-8">
        {passkeys.length > 0 ? (
          <div className="flex flex-col gap-2">
            <ExpandableList
              items={passkeys}
              renderItem={(passkey) => (
                <PasskeyTile
                  passkey={passkey}
                  onDelete={handleDeletePasskey}
                  loading={isPending && variables?.path.id === passkey.id}
                  onlyPasskeyLeft={passkeys.length === 1}
                />
              )}
              initialDisplayCount={3}
            />
          </div>
        ) : (
          <Button className="max-sm:w-full" variant="secondary" onClick={() => createPasskey()}>
            <FingerprintPatternIcon />
            {t('c:create_resource', { resource })}
          </Button>
        )}
      </div>
    </>
  );
}
