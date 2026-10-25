import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { TileListHeading, useOpenTile } from '~/modules/common/expandable-tile';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions, useRevokeSessionsMutation } from '~/modules/me/query';
import { isLiveSession, SessionTile, sessionEndedAt } from '~/modules/me/session-tile';
import type { Session } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';

export function SessionsList() {
  const { t } = useTranslation();
  // One tile open at a time, across both lists
  const { openId, toggle } = useOpenTile();

  const {
    data: { sessions: allSessions },
  } = useSuspenseQuery(meAuthQueryOptions());

  const liveSessions = allSessions.filter(isLiveSession);
  const revocable = liveSessions.filter((session) => !session.isCurrent);

  const currentDeviceHash = liveSessions.find((session) => session.isCurrent)?.deviceIdHash ?? null;
  const isCurrentDevice = (session: Session) => !session.isCurrent && session.deviceIdHash !== null && session.deviceIdHash === currentDeviceHash;
  const rank = (session: Session) => (session.isCurrent ? 0 : isCurrentDevice(session) ? 1 : 2);
  const sessions = liveSessions.sort((a, b) => rank(a) - rank(b));

  // Revoked and expired sessions of the last 30 days, the most recently ended first.
  const endedAt = (session: Session) => new Date(sessionEndedAt(session)).getTime();
  const history = allSessions.filter((session) => !isLiveSession(session)).sort((a, b) => endedAt(b) - endedAt(a));

  const { mutate: revoke, isPending, variables } = useRevokeSessionsMutation();

  const handleRevoke = (ids: string[]) => {
    if (!onlineManager.isOnline()) return toastOffline();
    revoke(ids);
  };

  return (
    <>
      <TileListHeading title={t('c:active')} count={sessions.length}>
        {revocable.length > 0 && (
          <Button
            className="-mr-2"
            variant="ghost"
            size="sm"
            loading={isPending && variables?.length === revocable.length}
            onClick={() => handleRevoke(revocable.map((session) => session.id))}
          >
            <UnplugIcon />
            {t('c:revoke_others')}
          </Button>
        )}
      </TileListHeading>
      <div className="mt-2 flex flex-col gap-2">
        <ExpandableList
          items={sessions}
          renderItem={(session) => (
            <SessionTile
              session={session}
              key={session.id}
              isCurrentDevice={isCurrentDevice(session)}
              onRevoke={handleRevoke}
              loading={isPending && variables?.includes(session.id)}
              expanded={openId === session.id}
              onToggle={() => toggle(session.id)}
            />
          )}
          initialDisplayCount={3}
        />
      </div>
      {history.length > 0 && (
        <>
          <TileListHeading className="mt-6 mb-3" title={t('c:ended')} count={history.length} />
          <div className="flex flex-col gap-2">
            <ExpandableList
              items={history}
              renderItem={(session) => (
                <SessionTile session={session} key={session.id} expanded={openId === session.id} onToggle={() => toggle(session.id)} />
              )}
              initialDisplayCount={2}
            />
          </div>
        </>
      )}
    </>
  );
}
