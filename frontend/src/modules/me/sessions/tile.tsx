import { ChevronDown, Monitor, ShieldCheck, Smartphone, ZapOff } from 'lucide-react';
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
  const { t } = useTranslation();

  const [expanded, setExpanded] = useState(false);

  const DeviceIcon = session.deviceType === 'desktop' ? Monitor : Smartphone;

  return (
    <Card className="w-full group/tile sm:has-[button:focus]:ring-2 transition-all" data-expanded={expanded}>
      <CardContent className="flex !p-2 sm:!p-3 lg:items-center gap-2 sm:gap-3">
        <DeviceIcon className="size-4 sm:w-8 sm:h-8 max-sm:mt-0.5" strokeWidth={1.5} />
        <div className="flex flex-col gap-1 w-full overflow-hidden">
          <div className="flex max-xs:flex-col gap-1 xs:gap-2">
            <span className="text-sm">{session.deviceName || t('common:unknown_device')}</span>
            <div className="empty:hidden flex gap-2">
              {session.type === 'mfa' && (
                <Badge
                  size="xs"
                  variant="outline"
                  className="py-0 text-[10px] uppercase flex items-center font-normal gap-1 text-green-600 border-green-600"
                >
                  <ShieldCheck size={12} />
                  {t('common:mfa_short')}
                </Badge>
              )}
              {session.isCurrent && (
                <Badge size="xs" variant="plain" className="uppercase font-normal text-[10px] py-0">
                  {t('common:current')}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-2 md:gap-x-5 gap-y-1 font-light text-xs sm:text-sm text-muted-foreground">
            <p className="truncate" aria-describedby={t('common:period')}>
              {dateShort(session.createdAt)} - {dateShort(session.expiresAt)}
            </p>
            {session.authStrategy && (
              <p
                className="truncate hidden lg:inline capitalize max-lg:group-data-[expanded=true]/tile:inline"
                aria-describedby={t('common:strategy')}
              >
                {t(session.authStrategy)}
              </p>
            )}
            <p className="truncate hidden lg:inline max-lg:group-data-[expanded=true]/tile:inline" aria-describedby={t('common:os')}>
              {session.deviceOs}
            </p>
            <p className="truncate hidden lg:inline max-lg:group-data-[expanded=true]/tile:inline" aria-describedby={t('common:browser')}>
              {session.browser}
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
              <ChevronDown size="12" className={`ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        {!session.isCurrent && (
          <Button variant="plain" size="sm" className="text-sm ml-auto" disabled={isPending} onClick={() => handleDeleteSessions([session.id])}>
            <ZapOff size={16} />
            <span className="ml-1 max-md:hidden">{t('common:terminate')}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
