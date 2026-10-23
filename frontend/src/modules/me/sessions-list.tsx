import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions, useRevokeSessionsMutation } from '~/modules/me/query';
import { isLiveSession, SessionTile, sessionEndedAt } from '~/modules/me/session-tile';
import type { Session } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';

export function SessionsList() {
  const { t } = useTranslation();

  const {
    data: { sessions: allSessions },
  } = useSuspenseQuery(meAuthQueryOptions());

  const liveSessions = allSessions.filter(isLiveSession);
  const revocable = liveSessions.filter((session) => !session.isCurrent);

  // Group the current session first, followed by matching device hashes and ungrouped sessions.
  const currentDeviceHash = liveSessions.find((session) => session.isCurrent)?.deviceIdHash ?? null;
  const isCurrentDevice = (session: Session) => !session.isCurrent && session.deviceIdHash !== null && session.deviceIdHash === currentDeviceHash;
  const rank = (session: Session) => (session.isCurrent ? 0 : isCurrentDevice(session) ? 1 : 2);
  const sessions = Array.from(liveSessions).sort((a, b) => rank(a) - rank(b));

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
      {revocable.length > 0 && (
        <Button
          className="max-sm:w-full"
          variant="plain"
          size="sm"
          loading={isPending && variables?.length === revocable.length}
          onClick={() => handleRevoke(revocable.map((session) => session.id))}
        >
          <UnplugIcon />
          {t('c:revoke_all')}
        </Button>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <ExpandableList
          items={sessions}
          renderItem={(session) => (
            <SessionTile
              session={session}
              key={session.id}
              isCurrentDevice={isCurrentDevice(session)}
              onRevoke={handleRevoke}
              loading={isPending && variables?.includes(session.id)}
            />
          )}
          initialDisplayCount={3}
          expandText="c:more_sessions"
        />
      </div>
      {history.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">{t('c:session_history')}</p>
          <ExpandableList
            items={history}
            renderItem={(session) => <SessionTile session={session} key={session.id} />}
            initialDisplayCount={2}
            expandText="c:more_sessions"
          />
        </div>
      )}
    </>
  );
}
