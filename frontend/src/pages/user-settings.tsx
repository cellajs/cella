import { SimpleHeader } from '~/components/simple-header';
import { Card, CardContent } from '~/components/ui/card';

import DeleteAccountForm from '~/components/delete-account-form';
import { dialog } from '~/components/dialoger/state';
import { Button } from '~/components/ui/button';
import { useUserStore } from '~/store/user';
import UpdateUserForm from '../components/update-user-form';

const UserSettings = () => {
  const user = useUserStore((state) => state.user);

  return (
    <>
      <SimpleHeader heading="Account settings" className="mx-auto sm:w-[500px]" text="Here you can update your account." />

      <div className="container mt-8">
        <Card className="mx-auto sm:w-[500px]">
          <CardContent className="pt-6">
            <UpdateUserForm user={user} />

            <hr className="my-6" />

            <p className="font-light text-sm">
              Want to permanently delete your Cella account? Use the button below. Please note that this action is irreversible.
            </p>
            <Button
              variant="destructive"
              className="mt-4"
              onClick={() => {
                dialog(<DeleteAccountForm user={user} dialog />, {
                  title: 'Delete account',
                  className: 'sm:w-[500px]',
                });
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
