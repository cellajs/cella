import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent } from '~/modules/ui/card';

import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import DeleteUsers from './delete-users';

import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import UpdateUserForm from '~/modules/users/update-user-form';

const UserSettings = () => {
  const user = useUserStore((state) => state.user);
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <>
      <SimpleHeader heading="Account settings" className="mx-auto sm:w-[600]" text="Here you can update your account." />

      <div className="container mt-8">
        <Card className="mx-auto sm:w-[600px]">
          <CardContent className="pt-6">
            <UpdateUserForm user={user} />

            <hr className="my-6" />

            <p className="font-light mb-4 text-sm">
              Want to permanently delete your Cella account? Use the button below. Please note that this action is irreversible.
            </p>
            <Button
              variant="destructive"
              onClick={() => {
                dialog(
                  <DeleteUsers
                    users={[user]}
                    callback={() => {
                      toast.success(t('common:success.delete_account'));
                      navigate({ to: '/auth/sign-in' });
                    }}
                    dialog
                  />,
                  {
                    className: 'sm:max-w-[64rem]',
                    title: t('common:delete_account'),
                    text: t('common:confirm.delete_account', { email: user.email }),
                  },
                );
              }}
            >
              Delete account
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default UserSettings;
