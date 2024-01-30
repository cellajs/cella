import { Trans, useTranslation } from 'react-i18next';
import { deleteUserById } from '~/api/users';
import { User } from '~/types';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import { dialog } from './dialoger/state';

interface Props {
  user: User;
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteAccountForm = ({ user, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [apiWrapper, pending] = useApiWrapper();

  const onDelete = () => {
    apiWrapper(
      () => deleteUserById(user.id),
      () => {
        callback?.(user);

        navigate({
          to: '/auth/sign-in',
        });

        if (isDialog) {
          dialog.remove();
        }

        toast.success(
          t('success.delete_organization', {
            defaultValue: 'Account deleted',
          }),
        );
      },
    );
  };

  return (
    <>
      <p>
        <Trans
          i18nKey="question.are_you_sure_to_delete_your_account"
          values={{ email: user.email }}
          defaults="Are you sure you want to delete your account with <strong>{{email}}</strong> email?"
        />
      </p>
      <div className="flex flex-col-reverse sm:flex-row gap-2">
        <Button type="submit" variant="destructive" onClick={onDelete} loading={pending}>
          {t('action.delete', {
            defaultValue: 'Delete',
          })}
        </Button>
        <Button variant="secondary" aria-label="Cancel" onClick={() => dialog.remove()}>
          {t('action.cancel', {
            defaultValue: 'Cancel',
          })}
        </Button>
      </div>
    </>
  );
};

export default DeleteAccountForm;
