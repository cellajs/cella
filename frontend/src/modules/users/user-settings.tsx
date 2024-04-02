import { Trash2 } from 'lucide-react';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent } from '~/modules/ui/card';

import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import DeleteUsers from './delete-users';
import { terminateMySessions as baseTerminateMySessions } from '~/api/users';

import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import UpdateUserForm from '~/modules/users/update-user-form';
import { ScrollArea } from '../ui/scroll-area';
import { useMutation } from '~/hooks/use-mutations';
import { useMemo } from 'react';

const UserSettings = () => {
  const user = useUserStore((state) => state.user);
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
    <>
      <SimpleHeader heading="Account settings" className="mx-auto sm:w-[600]" text="Here you can update your account." />

      <div className="container mt-8">
        <Card className="mx-auto sm:w-[600px]">
          <CardContent className="pt-6">
            <h1 className="font-semibold text-lg mb-4">General</h1>
            <UpdateUserForm user={user} />

            <hr className="my-6" />

            <h6 className="font-semibold mb-4">Sessions</h6>
            <p className="font-light text-sm mb-4">
              Here you can view and terminate your active sessions. Terminating a session will log you out from that device.
            </p>
            {sessionsWithoutCurrent.length > 0 && (
              <Button
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  terminateMySessions(sessionsWithoutCurrent.map((session) => session.id));
                }}
              >
                Terminate all
              </Button>
            )}
            <ScrollArea className="mt-4 max-h-72 overflow-auto px-2">
              {Array.from(user.sessions)
                .sort((a) => (a.current ? -1 : 1))
                .map((session) => (
                  <div key={session.id} className="flex items-center justify-between py-2">
                    <div>
                      <div>
                        <p className="font-semibold">Session {session.current && '(current)'}</p>
                        <p className="font-light text-sm">{session.type}</p>
                      </div>
                      <p className="font-light text-sm">{session.id}</p>
                    </div>
                    {!session.current && (
                      <Button
                        variant="destructive"
                        className="w-auto"
                        disabled={isPending}
                        onClick={() => {
                          terminateMySessions([session.id]);
                        }}
                      >
                        Terminate
                      </Button>
                    )}
                  </div>
                ))}
            </ScrollArea>

            <hr className="my-6" />

            <p className="font-light mb-4 text-sm">
              Want to permanently delete your Cella account? Use the button below. Please note that this action is irreversible.
            </p>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete account
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default UserSettings;
