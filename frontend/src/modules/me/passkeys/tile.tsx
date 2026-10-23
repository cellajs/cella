import { KeyRoundIcon, TrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { DeviceTile, DeviceTileDetail } from '~/modules/me/device-tile';
import type { Passkey } from '~/modules/me/types';
import { Badge } from '~/modules/ui/badge';
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

export function PasskeyTile({ passkey, onDelete, loading, onlyPasskeyLeft }: PasskeyTileProps) {
  const { t } = useTranslation();
  const user = useCurrentUser();

  return (
    <DeviceTile
      deviceType={passkey.deviceType}
      title={
        <div className="flex items-start gap-1 max-md:flex-col md:gap-2">
          <span className="text-sm max-sm:hidden">{passkey.deviceName || t('c:unknown_device')}</span>
          <TooltipButton toolTipContent={passkey.nameOnDevice} side="top">
            <Badge variant="outline" className="max-w-48">
              <KeyRoundIcon className="shrink-0" />
              <span className="truncate">{passkey.nameOnDevice}</span>
            </Badge>
          </TooltipButton>
        </div>
      }
      details={
        <>
          <DeviceTileDetail label={t('c:created_at')}>{dateShort(passkey.createdAt)}</DeviceTileDetail>
          <DeviceTileDetail label={t('c:os')} expandable>
            {passkey.deviceOs}
          </DeviceTileDetail>
          <DeviceTileDetail label={t('c:browser')} expandable>
            {passkey.browser}
          </DeviceTileDetail>
        </>
      }
      action={
        <Button variant="plain" size="sm" loading={loading} disabled={user.mfaRequired && onlyPasskeyLeft} onClick={() => onDelete(passkey.id)}>
          <TrashIcon />
          <span className="max-md:hidden">{t('c:delete')}</span>
        </Button>
      }
    />
  );
}
