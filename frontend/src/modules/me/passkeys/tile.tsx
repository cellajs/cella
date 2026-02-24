import { ChevronDownIcon, KeyRoundIcon, MonitorIcon, SmartphoneIcon, UnlinkIcon } from 'lucide-react';
import { useState } from 'react';
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

  const [expanded, setExpanded] = useState(false);

  const DeviceIcon = passkey.deviceType === 'desktop' ? MonitorIcon : SmartphoneIcon;

  return (
    <Card
      className="w-full group/tile py-0 sm:py-0 sm:has-[button:focus]:ring-2 transition-all"
      data-expanded={expanded}
    >
      <CardContent className="flex p-2! sm:p-3! lg:items-center gap-2 sm:gap-3">
        <DeviceIcon className="size-4 sm:w-8 sm:h-8 max-sm:mt-0.5" strokeWidth={1.5} />

        <div className="flex flex-col gap-1 w-full overflow-hidden">
          <div className="flex max-md:flex-col items-start gap-1 md:gap-2">
            <span className="text-sm">{passkey.deviceName || t('common:unknown_device')}</span>
            <Badge size="xs" variant="outline" className="truncate">
              <KeyRoundIcon size={12} />
              <span className="truncate">{passkey.nameOnDevice}</span>
            </Badge>
          </div>

          <div className="flex flex-wrap items-start gap-x-2 md:gap-x-5 gap-y-1 font-light text-sm text-muted-foreground">
            <p className="truncate" aria-describedby={t('common:created_at')}>
              {dateShort(passkey.createdAt)}
            </p>
            <p
              className="truncate hidden lg:inline max-lg:group-data-[expanded=true]/tile:inline"
              aria-describedby="OS"
            >
              {passkey.deviceOs}
            </p>
            <p
              className="truncate hidden lg:inline max-lg:group-data-[expanded=true]/tile:inline"
              aria-describedby={t('common:browser')}
            >
              {passkey.browser}
            </p>

            <Button
              variant="link"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              size="xs"
              className="lg:hidden p-0 font-light max-sm:text-[0.7rem] h-auto sm:opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 focus-visible:ring-transparent ring-offset-0 outline-0 transition-opacity"
            >
              <div className="group-data-[expanded=true]/tile:hidden">More</div>
              <div className="group-data-[expanded=false]/tile:hidden">Less</div>
              <ChevronDownIcon size="12" className={`ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </Button>
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
          <UnlinkIcon size={16} />
          <span className="ml-1 max-md:hidden">{t('common:unlink')}</span>
        </Button>
      </CardContent>
    </Card>
  );
};
