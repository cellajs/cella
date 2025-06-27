import { onlineManager, useMutation } from '@tanstack/react-query';
import { ZapOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteSessions } from '~/api.gen';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster';
import { SessionTile } from '~/modules/me/session-tile';
import type { MeAuthData } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';

const SessionsList = ({ userAuthInfo }: { userAuthInfo: MeAuthData }) => {
  const { t } = useTranslation();

  const [allSessions, setAllSessions] = useState(userAuthInfo.sessions);

  const sessionsWithoutCurrent = useMemo(() => allSessions.filter((session) => !session.isCurrent), [allSessions]);
  const sessions = Array.from(allSessions).sort((a) => (a.isCurrent ? -1 : 1));

  // Terminate one or all sessions
  const { mutate: deleteMySessions, isPending } = useMutation({
    mutationFn: async (ids: string[]) => {
      await deleteSessions({ body: { ids } });
      return ids;
    },
    onSuccess(ids) {
      if (!allSessions.length) return;
      setAllSessions(allSessions.filter((session) => !ids.includes(session.id)));

      toaster(ids.length === 1 ? t('common:success.session_terminated', { id: ids[0] }) : t('common:success.sessions_terminated'), 'success');
    },
  });

  const onDeleteSession = (ids: string[]) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    deleteMySessions(ids);
  };

  return (
    <>
      {sessionsWithoutCurrent.length > 0 && (
        <Button
          className="max-xs:w-full"
          variant="plain"
          size="sm"
          disabled={isPending}
          onClick={() => onDeleteSession(sessionsWithoutCurrent.map((session) => session.id))}
        >
          <ZapOff size={16} className="mr-2" />
          {t('common:terminate_all')}
        </Button>
      )}
      <div className="flex flex-col mt-4 gap-2">
        <ExpandableList
          items={sessions}
          renderItem={(session) => <SessionTile session={session} key={session.id} deleteMySessions={onDeleteSession} isPending={isPending} />}
          initialDisplayCount={3}
          expandText="common:more_sessions"
        />
      </div>
    </>
  );
};

export default SessionsList;
