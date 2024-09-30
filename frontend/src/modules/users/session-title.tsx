import { Monitor, Smartphone, ZapOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent } from '~/modules/ui/card';
import type { Session } from '~/types/common';
import { dateShort } from '~/utils/utils';

interface SessionTileProps {
  session: Session;
  deleteMySessions: (sessionIds: string[]) => void;
  isPending: boolean;
}

export const SessionTile = ({ session, deleteMySessions, isPending }: SessionTileProps) => {
  const { t } = useTranslation();

  return (
    <Card className="w-full">
      <CardContent className="flex p-3 items-center gap-3">
        {session.deviceType === 'desktop' ? <Monitor size={32} strokeWidth={1.25} /> : <Smartphone size={32} strokeWidth={1.25} />}
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <div className="font-semibold">{session.deviceName || t('common:unknown_device')}</div>
            {session.isCurrent && (
              <Badge variant="plain" className="uppercase text-[10px] py-0">
                {t('common:current')}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-x-2 md:gap-x-5 gap-y-1 font-light text-sm opacity-50">
            <p className="truncate" aria-describedby={t('common:period')}>
              {dateShort(session.createdAt)} - {dateShort(session.expiresAt)}
            </p>
            {session.authStrategy && (
              <p className="truncate max-sm:hidden capitalize" aria-describedby={t('common:strategy')}>
                {t(session.authStrategy)}
              </p>
            )}
            <p className="truncate max-lg:hidden" aria-describedby={t('common:os')}>
              {session.deviceOs}
            </p>
            <p className="truncate max-md:hidden" aria-describedby={t('common:browser')}>
              {session.browser}
            </p>
          </div>
        </div>
        {!session.isCurrent && (
          <Button
            variant="plain"
            size="sm"
            className="text-sm ml-auto"
            disabled={isPending}
            onClick={() => {
              deleteMySessions([session.id]);
            }}
          >
            <ZapOff size={16} />
            <span className="ml-1 max-md:hidden">{t('common:terminate')}</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
