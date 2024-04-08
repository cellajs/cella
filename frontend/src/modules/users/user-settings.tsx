import { Trash2 } from 'lucide-react';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent } from '~/modules/ui/card';

import { terminateMySessions as baseTerminateMySessions } from '~/api/users';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import DeleteUsers from './delete-users';

import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import UpdateUserForm from '~/modules/users/update-user-form';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '~/modules/ui/tabs';

const tabs = [
  { value: 'general', label: 'common:general', hash: 'general' },
  { value: 'sessions', label: 'common:sessions', hash: 'sessions' },
  { value: 'delete_account', label: 'common:delete_account', hash: 'delete-account' },
];

const UserSettings = () => {
  const user = useUserStore((state) => state.user);
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [activeTab, setActiveTab] = useState(tabs.find((tab) => tab.hash === location.hash.toLowerCase())?.value || tabs[0].value);
  const { t } = useTranslation();

  useEffect(() => {
    function handleHashChange() {
      const hash = tabs.find((tab) => tab.hash === location.hash.toLowerCase())?.value || tabs[0].value;
      setActiveTab(hash);
    }
    handleHashChange();
  }, [location.hash]);

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
    <div className="md:flex md:flex-row mx-auto max-w-[1600px]">
      <SimpleHeader heading="common:account_settings" className="mx-auto md:min-w-[200px] md:w-[30%]" text="common:account_settings.text">
        <Tabs value={activeTab} className="w-full" orientation="vertical">
          <TabsList variant="side">
            {tabs.map(({ value, label, hash }) => (
              <TabsTrigger value={value} className="text-left" variant="secondary" size="lg">
                <Link className="flex-1" hash={hash}>
                  {t(label)}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </SimpleHeader>

      <div className="container mt-8 md:w-[70%] space-y-6">
        <Card className="mx-auto sm:w-full">
          <CardContent className="pt-6">
            <h1 id="general" className="font-semibold text-lg mb-4">
              {t('common:general')}
            </h1>
            <UpdateUserForm user={user} />
          </CardContent>
        </Card>

        <Card className="mx-auto sm:w-full">
          <CardContent className="pt-6">
            <h6 id="sessions" className="font-semibold mb-4">
              {t('common:sessions')}
            </h6>
            <p className="font-light text-sm mb-4">{t('common:sessions.text')}</p>
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
            <ScrollArea className="mt-4 max-h-72 overflow-auto px-2">
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

        <Card className="mx-auto sm:w-full">
          <CardContent className="pt-6">
            <p id="delete-account" className="font-light mb-4 text-sm">
              {t('common:delete_account.text')}
            </p>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common:delete_account')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserSettings;
