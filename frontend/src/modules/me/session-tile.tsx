import { ChevronDownIcon, MonitorIcon, ShieldCheckIcon, SmartphoneIcon, ZapOffIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Session } from '~/modules/me/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import { dateShort } from '~/utils/date-short';

interface SessionTileProps {
  session: Session;
  handleDeleteSessions: (sessionIds: string[]) => void;
  isPending: boolean;
}

export const SessionTile = ({ session, handleDeleteSessions, isPending }: SessionTileProps) => {
  const { t, i18n } = useTranslation();

  const [expanded, setExpanded] = useState(false);

  const DeviceIcon = session.deviceType === 'desktop' ? MonitorIcon : SmartphoneIcon;

  const countryName = session.ipCountry
    ? (() => {
        try {
          return new Intl.DisplayNames([i18n.language], { type: 'region' }).of(session.ipCountry) ?? session.ipCountry;
        } catch {
          return session.ipCountry;
        }
      })()
    : null;

  return (
    <Card
      className="group/tile w-full py-0 transition-all sm:py-0 sm:has-[button:focus]:ring-2"
      data-expanded={expanded}
    >
      <CardContent className="flex gap-2 p-2! sm:gap-3 sm:p-3! lg:items-center">
        <DeviceIcon className="size-4 max-sm:mt-0.5 sm:h-8 sm:w-8" strokeWidth={1.5} />
        <div className="flex w-full flex-col gap-1 overflow-hidden">
          <div className="flex gap-1 xs:gap-2 max-xs:flex-col">
            <span className="text-sm">{session.deviceName || t('c:unknown_device')}</span>
            <div className="flex items-center gap-2 empty:hidden">
              {session.type === 'mfa' && (
                <Badge size="xs" variant="outline" className="border-green-600 text-green-600">
                  <ShieldCheckIcon size={12} />
                  {t('c:mfa_short')}
                </Badge>
              )}
              {session.isCurrent && (
                <Badge size="xs" variant="plain">
                  {t('c:current')}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground text-xs sm:text-sm md:gap-x-5">
            <p className="truncate" aria-describedby={t('c:period')}>
              {dateShort(session.createdAt)} - {dateShort(session.expiresAt)}
            </p>
            {session.authStrategy && (
              <p
                className="hidden truncate capitalize max-lg:group-data-[expanded=true]/tile:inline lg:inline"
                aria-describedby={t('c:strategy')}
              >
                {t(session.authStrategy)}
              </p>
            )}
            <p
              className="hidden truncate max-lg:group-data-[expanded=true]/tile:inline lg:inline"
              aria-describedby="os"
            >
              {session.deviceOs}
            </p>
            <p
              className="hidden truncate max-lg:group-data-[expanded=true]/tile:inline lg:inline"
              aria-describedby={t('c:browser')}
            >
              {session.browser}
            </p>
            {countryName && (
              <p
                className="hidden truncate max-lg:group-data-[expanded=true]/tile:inline lg:inline"
                aria-describedby={t('c:country')}
              >
                {countryName}
              </p>
            )}
            <Button
              variant="link"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              size="xs"
              className="h-auto p-0 outline-0 ring-offset-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-transparent group-hover/tile:opacity-100 max-sm:text-[0.7rem] sm:opacity-0 lg:hidden"
            >
              <div className="group-data-[expanded=true]/tile:hidden">More</div>
              <div className="group-data-[expanded=false]/tile:hidden">Less</div>
              <ChevronDownIcon size="12" className={`ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        {!session.isCurrent && (
          <Button
            variant="plain"
            size="sm"
            className="ml-auto text-sm"
            disabled={isPending}
            onClick={() => handleDeleteSessions([session.id])}
          >
            <ZapOffIcon size={16} />
            <span className="ml-1 max-md:hidden">{t('c:terminate')}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
