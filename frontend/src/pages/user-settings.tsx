import { SimpleHeader } from '~/components/simple-header';
import { Card, CardContent } from '~/components/ui/card';

import DeleteAccountForm from '~/components/delete-account-form';
import { dialog } from '~/components/dialoger/state';
import { Button } from '~/components/ui/button';
import { useUserStore } from '~/store/user';
import UpdateUserForm from '../components/update-user-form';
import { useNavigate } from '@tanstack/react-router';

const UserSettings = () => {
  const user = useUserStore((state) => state.user);
  const navigate = useNavigate();

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
                  <DeleteAccountForm
                    user={user}
                    callback={() => {
                      navigate({
                        to: '/auth/sign-in',
                      });
                    }}
                    dialog
                  />,
                  {
                    title: 'Delete account',
                    className: 'sm:w-[600px]',
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
