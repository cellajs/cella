import { Trash2 } from 'lucide-react';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

import { terminateMySessions as baseTerminateMySessions } from '~/api/users';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import DeleteUsers from './delete-users';

import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import UpdateUserForm from '~/modules/users/update-user-form';
import { ScrollArea } from '../ui/scroll-area';
import { AsideNav } from '~/modules/common/aside-nav';
import { AsideAnchor } from '../common/aside-anchor';
import Sticky from 'react-sticky-el';

const tabs = [
  { value: 'general', label: 'common:general', hash: 'general' },
  { value: 'sessions', label: 'common:sessions', hash: 'sessions' },
  { value: 'delete-account', label: 'common:delete_account', hash: 'delete-account' },
];

const UserSettings = () => {
  const { user, clearLastUser } = useUserStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const sessionsWithoutCurrent = useMemo(() => user.sessions.filter((session) => !session.current), [user.sessions]);

  const { mutate: terminateMySessions, isPending } = useMutation({
    mutationFn: baseTerminateMySessions,
    onSuccess: (_data, variables) => {
      useUserStore.setState((state) => {
        state.user.sessions = state.user.sessions.filter((session) => !variables.includes(session.id));
      });
    },
  });

  const openDeleteDialog = () => {
    dialog(
      <DeleteUsers
        users={[user]}
        dialog
        callback={() => {
          toast.success(t('common:success.delete_account'));
          clearLastUser();
          navigate({ to: '/sign-out', replace: true });
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_account'),
        text: t('common:confirm.delete_account', { email: user.email }),
      },
    );
  };

  return (
    <div className="container md:flex md:flex-row md:mt-8 mx-auto max-w-[1200px] gap-4">
      <div className="mx-auto md:min-w-[200px] md:w-[30%] md:mt-2">
      <Sticky stickyClassName="z-10 max-sm:!relative">
        <SimpleHeader className="p-3" heading="common:account_settings" text="common:account_settings.text" />
        <AsideNav tabs={tabs} className="py-2" />
      </Sticky>
      </div>

      <div className="md:w-[70%] space-y-6">
        <AsideAnchor id="general">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('common:general')}</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateUserForm user={user} />
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="sessions">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('common:sessions')}</CardTitle>

              <CardDescription>{t('common:sessions.text')}</CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsWithoutCurrent.length > 0 && (
                <Button
                  variant="plain"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    terminateMySessions(sessionsWithoutCurrent.map((session) => session.id));
                  }}
                >
                  {t('common:terminate_all')}
                </Button>
              )}
              <ScrollArea className="max-h-72 mt-2 overflow-auto">
                {Array.from(user.sessions)
                  .sort((a) => (a.current ? -1 : 1))
                  .map((session) => (
                    <div key={session.id} className="flex items-center justify-between py-2">
                      <div>
                        <div>
                          <p className="font-semibold">
                            {t('common:session')} {session.current && '(current)'}
                          </p>
                          <p className="font-light text-sm">{session.type}</p>
                        </div>
                        <p className="font-light text-sm">{session.id}</p>
                      </div>
                      {!session.current && (
                        <Button
                          variant="plain"
                          size="sm"
                          className="w-auto"
                          disabled={isPending}
                          onClick={() => {
                            terminateMySessions([session.id]);
                          }}
                        >
                          {t('common:terminate')}
                        </Button>
                      )}
                    </div>
                  ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="delete-account">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('common:delete_account')}</CardTitle>
              <CardDescription>{t('common:delete_account.text')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('common:delete_account')}
              </Button>
            </CardContent>
          </Card>
        </AsideAnchor>
      </div>
    </div>
  );
};

export default UserSettings;
