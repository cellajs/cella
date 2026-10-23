import { ShieldCheckIcon, UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig, type FederationKey } from 'shared';
import { DeviceTile, DeviceTileDetail } from '~/modules/me/device-tile';
import type { Session } from '~/modules/me/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { dateShort } from '~/utils/date-short';

/** The federation keys the app declares. An app without federations types the record by `string`, which names none. */
type DeclaredFederation = string extends FederationKey ? never : FederationKey;

/** A session that still authenticates: not revoked and not past its expiry. */
export const isLiveSession = (session: Session) => session.revokedAt === null && new Date(session.expiresAt).getTime() > Date.now();

/** When the session stopped authenticating, or will: its revocation, else its expiry. */
export const sessionEndedAt = (session: Session) => session.revokedAt ?? session.expiresAt;

/** The region's name in `language`, or its code where the browser has no name for it. */
const regionName = (code: string, language: string) => {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

interface SessionTileProps {
  session: Session;
  /** Session from the same device as the current session (matched on deviceIdHash). */
  isCurrentDevice?: boolean;
  /** Absent in the history list: a revoked or expired session has nothing left to revoke. */
  onRevoke?: (sessionIds: string[]) => void;
  /** This session's revoke is running. */
  loading?: boolean;
}

export function SessionTile({ session, isCurrentDevice, onRevoke, loading }: SessionTileProps) {
  const { t, i18n } = useTranslation();
  /** A federation names itself in config; every other method has a locale key. */
  const strategyLabel = (strategy: NonNullable<Session['authStrategy']>) =>
    strategy in appConfig.federations
      ? appConfig.federations[strategy as FederationKey].label
      : t(`c:${strategy as Exclude<typeof strategy, DeclaredFederation>}`);

  const isRevoked = session.revokedAt !== null;
  const isExpired = !isRevoked && !isLiveSession(session);
  const countryName = session.ipCountry ? regionName(session.ipCountry, i18n.language) : null;

  return (
    <DeviceTile
      deviceType={session.deviceType}
      title={
        <div className="flex gap-1 xs:gap-2 max-xs:flex-col">
          <span className="text-sm">{session.deviceName || t('c:unknown_device')}</span>
          <div className="flex items-center gap-2 empty:hidden">
            {session.type === 'mfa' && (
              <Badge variant="success" soft>
                <ShieldCheckIcon />
                {t('c:mfa_short')}
              </Badge>
            )}
            {session.isCurrent && <Badge variant="plain">{t('c:current')}</Badge>}
            {isCurrentDevice && <Badge variant="outline">{t('c:this_device')}</Badge>}
            {session.isNewDevice && !session.isCurrent && !isCurrentDevice && <Badge variant="warning">{t('c:new_device')}</Badge>}
            {isRevoked && <Badge variant="secondary">{t('c:revoked')}</Badge>}
            {isExpired && <Badge variant="secondary">{t('c:expired')}</Badge>}
          </div>
        </div>
      }
      details={
        <>
          <DeviceTileDetail label={t('c:period')}>
            {dateShort(session.createdAt)} - {dateShort(sessionEndedAt(session))}
          </DeviceTileDetail>
          {session.revocationReason && (
            <DeviceTileDetail label={t('c:revoked')}>{t(`c:revocation_reason.${session.revocationReason}`)}</DeviceTileDetail>
          )}
          {session.authStrategy && (
            <DeviceTileDetail label={t('c:strategy')} expandable>
              <span className="capitalize">{strategyLabel(session.authStrategy)}</span>
            </DeviceTileDetail>
          )}
          {session.deviceOs && (
            <DeviceTileDetail label={t('c:os')} expandable>
              {session.deviceOs}
            </DeviceTileDetail>
          )}
          {session.browser && (
            <DeviceTileDetail label={t('c:browser')} expandable>
              {session.browser}
            </DeviceTileDetail>
          )}
          {countryName && (
            <DeviceTileDetail label={t('c:country')} expandable>
              {countryName}
            </DeviceTileDetail>
          )}
        </>
      }
      action={
        !session.isCurrent &&
        onRevoke && (
          <Button variant="plain" size="sm" loading={loading} onClick={() => onRevoke([session.id])}>
            <UnplugIcon />
            <span className="max-md:hidden">{t('c:revoke')}</span>
          </Button>
        )
      }
    />
  );
}
