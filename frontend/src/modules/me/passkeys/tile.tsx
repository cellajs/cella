import { KeyRoundIcon, TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { DeviceTile } from '~/modules/me/device-tile';
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
  expanded: boolean;
  onToggle: () => void;
}

export function PasskeyTile({ passkey, onDelete, loading, onlyPasskeyLeft, expanded, onToggle }: PasskeyTileProps) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  // The backend keeps the last passkey while MFA is on
  const locked = user.mfaRequired && onlyPasskeyLeft;

  return (
    <DeviceTile
      device={passkey}
      expanded={expanded}
      onToggle={onToggle}
      meta={
        <>
          <KeyRoundIcon className="mr-1.5 inline size-3 align-[-0.0625em]" />
          {passkey.nameOnDevice}
        </>
      }
      details={
        <>
          <ExpandableTileDetail label={t('c:created_at')}>{dateShort(passkey.createdAt)}</ExpandableTileDetail>
          {passkey.browser && <ExpandableTileDetail label={t('c:browser')}>{passkey.browser}</ExpandableTileDetail>}
          {passkey.deviceOs && <ExpandableTileDetail label={t('c:os')}>{passkey.deviceOs}</ExpandableTileDetail>}
        </>
      }
      actions={
        <>
          <Button variant="plain" size="sm" className="max-sm:w-full" loading={loading} disabled={locked} onClick={() => onDelete(passkey.id)}>
            <TrashIcon />
            {t('c:delete')}
          </Button>
          {locked && <p className="text-muted-foreground text-sm">{t('c:passkey_locked.text')}</p>}
        </>
      }
    />
  );
}
