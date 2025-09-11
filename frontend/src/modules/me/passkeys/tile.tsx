import { Monitor, Smartphone, Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Passkey } from '~/modules/me/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { useUserStore } from '~/store/user';
import { dateShort } from '~/utils/date-short';

interface PasskeyTileProps {
  passkey: Passkey;
  handleUnlinkPasskey: (id: string) => void;
  isPending: boolean;
  onlyPasskeyLeft: boolean;
}

export const PasskeyTile = ({ passkey, handleUnlinkPasskey, isPending, onlyPasskeyLeft }: PasskeyTileProps) => {
  const { t } = useTranslation();

  const user = useUserStore((state) => state.user);

  return (
    <Card className="w-full">
      <CardContent className="flex !p-3 items-center gap-3">
        {passkey.deviceType === 'desktop' ? <Monitor size={32} strokeWidth={1.25} /> : <Smartphone size={32} strokeWidth={1.25} />}

        <div className="flex flex-col gap-1 overflow-hidden">
          <div className="flex gap-2 items-center">
            <div className="font-semibold">{passkey.deviceName || t('common:unknown_device')}</div>
            <Badge size="sm" variant="outline" className="normal-case">
              {passkey.nameOnDevice}
            </Badge>
          </div>

          <div className="flex flex-wrap items-start gap-x-2 md:gap-x-5 gap-y-1 font-light text-sm text-muted-foreground">
            <p className="truncate" aria-describedby={t('common:created_at')}>
              {dateShort(passkey.createdAt)}
            </p>
            <p className="truncate max-lg:hidden" aria-describedby="OS">
              {passkey.deviceOs}
            </p>
            <p className="truncate max-md:hidden" aria-describedby={t('common:browser')}>
              {passkey.browser}
            </p>
          </div>
        </div>

        <Button
          variant="plain"
          size="sm"
          className="text-sm ml-auto"
          loading={isPending}
          disabled={user.mfaRequired && onlyPasskeyLeft}
          onClick={() => handleUnlinkPasskey(passkey.id)}
        >
          <Unlink size={16} />
          <span className="ml-1 max-md:hidden">{t('common:unlink')}</span>
        </Button>
      </CardContent>
    </Card>
  );
};
