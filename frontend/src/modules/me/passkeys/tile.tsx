import { ChevronDownIcon, KeyRoundIcon, MonitorIcon, SmartphoneIcon, UnlinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { Passkey } from '~/modules/me/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { useUserStore } from '~/modules/user/user-store';
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
      className="group/tile w-full py-0 transition-all sm:py-0 sm:has-[button:focus]:ring-2"
      data-expanded={expanded}
    >
      <CardContent className="flex gap-2 p-2! sm:gap-3 sm:p-3! lg:items-center">
        <DeviceIcon className="size-4 max-sm:mt-0.5 sm:h-8 sm:w-8" strokeWidth={1.5} />

        <div className="flex w-full flex-col gap-1 overflow-hidden">
          <div className="flex items-start gap-1 max-md:flex-col md:gap-2">
            <span className="text-sm max-sm:hidden">{passkey.deviceName || t('c:unknown_device')}</span>
            <TooltipButton toolTipContent={passkey.nameOnDevice} side="top">
              <Badge size="xs" variant="outline" className="max-w-48 truncate">
                <KeyRoundIcon className="icon-xs shrink-0" />
                <span className="truncate">{passkey.nameOnDevice}</span>
              </Badge>
            </TooltipButton>
          </div>

          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-muted-foreground text-sm md:gap-x-5">
            <p className="truncate" aria-describedby={t('c:created_at')}>
              {dateShort(passkey.createdAt)}
            </p>
            <p
              className="hidden truncate max-lg:group-data-[expanded=true]/tile:inline lg:inline"
              aria-describedby="OS"
            >
              {passkey.deviceOs}
            </p>
            <p
              className="hidden truncate max-lg:group-data-[expanded=true]/tile:inline lg:inline"
              aria-describedby={t('c:browser')}
            >
              {passkey.browser}
            </p>

            <Button
              variant="link"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              size="xs"
              className="h-auto p-0 outline-0 ring-offset-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-transparent group-hover/tile:opacity-100 sm:opacity-0 lg:hidden"
            >
              <div className="group-data-[expanded=true]/tile:hidden">More</div>
              <div className="group-data-[expanded=false]/tile:hidden">Less</div>
              <ChevronDownIcon className={`icon-xs ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        <Button
          variant="plain"
          size="sm"
          className="ml-auto text-sm"
          loading={isPending}
          disabled={user.mfaRequired && onlyPasskeyLeft}
          onClick={() => handleUnlinkPasskey(passkey.id)}
        >
          <UnlinkIcon />
          <span className="ml-1 max-md:hidden">{t('c:unlink')}</span>
        </Button>
      </CardContent>
    </Card>
  );
};
