import { onlineManager, useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { UnplugIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MeAuthData } from 'sdk';
import { revokeMySessions } from 'sdk';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions } from '~/modules/me/query';
import { SessionTile } from '~/modules/me/session-tile';
import type { Session } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';

/** A session that still authenticates: not revoked and not past its expiry. */
export const isLiveSession = (session: Session) =>
  session.revokedAt === null && new Date(session.expiresAt).getTime() > Date.now();

export function SessionsList() {
  const { t } = useTranslation();

  const queryOptions = meAuthQueryOptions();
  const {
    data: { sessions: allSessions },
  } = useSuspenseQuery(queryOptions);

  const liveSessions = allSessions.filter(isLiveSession);
  const revocable = liveSessions.filter((session) => !session.isCurrent);

  // Group the current session first, followed by matching device hashes and ungrouped sessions.
  const currentDeviceHash = liveSessions.find((session) => session.isCurrent)?.deviceIdHash ?? null;
  const isCurrentDevice = (session: Session) =>
    !session.isCurrent && session.deviceIdHash !== null && session.deviceIdHash === currentDeviceHash;
  const rank = (session: Session) => (session.isCurrent ? 0 : isCurrentDevice(session) ? 1 : 2);
  const sessions = Array.from(liveSessions).sort((a, b) => rank(a) - rank(b));

  // Revoked and expired sessions of the last 30 days, the most recently ended first.
  const endedAt = (session: Session) => new Date(session.revokedAt ?? session.expiresAt).getTime();
  const history = allSessions.filter((session) => !isLiveSession(session)).sort((a, b) => endedAt(b) - endedAt(a));

  const { mutate: revoke, isPending } = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await revokeMySessions({ body: { ids } });
      return data;
    },
    onSuccess: (revoked) => {
      queryClient.setQueryData<MeAuthData>(queryOptions.queryKey, (oldData) => {
        if (!oldData) return oldData;
        const revokedById = new Map(revoked.map((session) => [session.id, session]));
        return {
          ...oldData,
          sessions: oldData.sessions.map((session) => {
            const revokedSession = revokedById.get(session.id);
            return revokedSession ? { ...session, ...revokedSession } : session;
          }),
        };
      });

      toaster.success(
        t('c:success.revoke_resource', { resource: t(revoked.length === 1 ? 'c:session' : 'c:sessions') }),
      );
    },
  });

  const handleRevoke = (ids: string[]) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));
    revoke(ids);
  };

  return (
    <>
      {revocable.length > 0 && (
        <Button
          className="max-xs:w-full"
          variant="plain"
          size="sm"
          disabled={isPending}
          onClick={() => handleRevoke(revocable.map((session) => session.id))}
        >
          <UnplugIcon className="mr-2" />
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
              handleRevoke={handleRevoke}
              isPending={isPending}
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
