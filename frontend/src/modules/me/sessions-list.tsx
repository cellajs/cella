import { onlineManager, useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { ZapOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MeAuthData } from 'sdk';
import { deleteMySessions } from 'sdk';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions } from '~/modules/me/query';
import { SessionTile } from '~/modules/me/session-tile';
import { Button } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';

export function SessionsList() {
  const { t } = useTranslation();

  const queryOptions = meAuthQueryOptions();
  const {
    data: { sessions: allSessions },
  } = useSuspenseQuery(queryOptions);

  const sessionsWithoutCurrent = allSessions.filter((session) => !session.isCurrent);
  const sessions = Array.from(allSessions).sort((a) => (a.isCurrent ? -1 : 1));

  // Terminate one or all sessions
  const { mutate: _deleteMySessions, isPending } = useMutation({
    mutationFn: async (ids: string[]) => {
      await deleteMySessions({ body: { ids } });
      return ids;
    },
    onSuccess: (ids) => {
      if (!allSessions.length) return;

      queryClient.setQueryData<MeAuthData>(queryOptions.queryKey, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          sessions: oldData.sessions.filter(({ id }) => !ids.includes(id)),
        };
      });

      toaster(
        ids.length === 1 ? t('c:success.session_terminated', { id: ids[0] }) : t('c:success.sessions_terminated'),
        'success',
      );
    },
  });

  const handleDeleteSessions = (ids: string[]) => {
    if (!onlineManager.isOnline()) return toaster(t('c:action.offline.text'), 'warning');
    _deleteMySessions(ids);
  };

  return (
    <>
      {sessionsWithoutCurrent.length > 0 && (
        <Button
          className="max-xs:w-full"
          variant="plain"
          size="sm"
          disabled={isPending}
          onClick={() => handleDeleteSessions(sessionsWithoutCurrent.map((session) => session.id))}
        >
          <ZapOffIcon className="mr-2" />
          {t('c:terminate_all')}
        </Button>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <ExpandableList
          items={sessions}
          renderItem={(session) => (
            <SessionTile
              session={session}
              key={session.id}
              handleDeleteSessions={handleDeleteSessions}
              isPending={isPending}
            />
          )}
          initialDisplayCount={3}
          expandText="c:more_sessions"
        />
      </div>
    </>
  );
}
