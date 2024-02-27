import { Trash2 } from 'lucide-react';
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

  const openDeleteDialog = () => {
    dialog(
      <DeleteUsers
        users={[user]}
        dialog
        callback={() => {
          toast.success(t('common:success.delete_account'));
          navigate({ to: '/auth/sign-in' });
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
