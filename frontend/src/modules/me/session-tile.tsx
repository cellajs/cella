import dayjs from 'dayjs';
import { ShieldCheckIcon, UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig, type FederationKey } from 'shared';
import { ExpandableTileDetail, type TileTone } from '~/modules/common/expandable-tile';
import { DeviceTile } from '~/modules/me/device-tile';
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

/** Per status: its color and the label of the date it ends. */
const statuses = {
  current: { tone: 'success', endLabel: 'c:expires_at' },
  active: { tone: 'info', endLabel: 'c:expires_at' },
  expired: { tone: 'warning', endLabel: 'c:expired' },
  revoked: { tone: 'destructive', endLabel: 'c:revoked' },
} as const satisfies Record<string, { tone: TileTone; endLabel: string }>;

const sessionStatus = (session: Session): keyof typeof statuses => {
  if (session.revokedAt !== null) return 'revoked';
  if (!isLiveSession(session)) return 'expired';
  return session.isCurrent ? 'current' : 'active';
};

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

  const status = sessionStatus(session);
  const isLive = status === 'current' || status === 'active';
  const countryName = session.ipCountry ? regionName(session.ipCountry, i18n.language) : null;

  return (
    <DeviceTile
      value={session.id}
      device={session}
      status={{ tone: statuses[status].tone, label: t(`c:${status}`) }}
      badges={
        <>
          {session.type === 'mfa' && (
            <span className="flex shrink-0 items-center gap-1 text-success">
              <ShieldCheckIcon className="size-4" />
              <span className="font-medium text-xs max-sm:sr-only">{t('c:mfa_short')}</span>
            </span>
          )}
          {isCurrentDevice && <Badge variant="outline">{t('c:this_device')}</Badge>}
          {session.isNewDevice && !session.isCurrent && !isCurrentDevice && <Badge variant="warning">{t('c:new_device')}</Badge>}
        </>
      }
      meta={isLive ? t('c:expires_relative', { time: dayjs(session.expiresAt).fromNow() }).toLowerCase() : dateShort(sessionEndedAt(session))}
      details={
        <>
          <ExpandableTileDetail label={t('c:signed_in')}>{dateShort(session.createdAt)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t(statuses[status].endLabel)}>{dateShort(sessionEndedAt(session))}</ExpandableTileDetail>
          {session.revocationReason && (
            <ExpandableTileDetail label={t('c:reason')}>{t(`c:revocation_reason.${session.revocationReason}`)}</ExpandableTileDetail>
          )}
          {session.authStrategy && (
            <ExpandableTileDetail label={t('c:strategy')}>
              <span className="capitalize">{strategyLabel(session.authStrategy)}</span>
            </ExpandableTileDetail>
          )}
          {session.browser && <ExpandableTileDetail label={t('c:browser')}>{session.browser}</ExpandableTileDetail>}
          {session.deviceOs && <ExpandableTileDetail label={t('c:os')}>{session.deviceOs}</ExpandableTileDetail>}
          {countryName && <ExpandableTileDetail label={t('c:country')}>{countryName}</ExpandableTileDetail>}
        </>
      }
      actions={
        status === 'active' &&
        onRevoke && (
          <Button variant="plain" size="sm" className="max-sm:w-full" loading={loading} onClick={() => onRevoke([session.id])}>
            <UnplugIcon />
            {t('c:revoke')}
          </Button>
        )
      }
    />
  );
}
