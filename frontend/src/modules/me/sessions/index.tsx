import { onlineManager, useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { ZapOff } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteMySessions } from '~/api.gen';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/service';
import { meAuthQueryOptions } from '~/modules/me/query';
import { SessionTile } from '~/modules/me/sessions/tile';
import type { MeAuthData } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';

const SessionsList = () => {
  const { t } = useTranslation();

  const queryOptions = meAuthQueryOptions();
  const {
    data: { sessions: allSessions },
  } = useSuspenseQuery(queryOptions);

  const sessionsWithoutCurrent = useMemo(() => allSessions.filter((session) => !session.isCurrent), [allSessions]);
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

      toaster(ids.length === 1 ? t('common:success.session_terminated', { id: ids[0] }) : t('common:success.sessions_terminated'), 'success');
    },
  });

  const handleDeleteSessions = (ids: string[]) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
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
          <ZapOff size={16} className="mr-2" />
          {t('common:terminate_all')}
        </Button>
      )}
      <div className="flex flex-col mt-4 gap-2">
        <ExpandableList
          items={sessions}
          renderItem={(session) => (
            <SessionTile session={session} key={session.id} handleDeleteSessions={handleDeleteSessions} isPending={isPending} />
          )}
          initialDisplayCount={3}
          expandText="common:more_sessions"
        />
      </div>
    </>
  );
};

export default SessionsList;
