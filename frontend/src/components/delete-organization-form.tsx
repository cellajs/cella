import { Trans, useTranslation } from 'react-i18next';
import { deleteOrganizationById } from '~/api/api';
import { Organization } from '~/types';

import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import { dialog } from './dialoger/state';

interface Props {
  organization: Organization;
  callback?: (organization: Organization) => void;
  dialog?: boolean;
}

const DeleteOrganizationForm = ({ organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();

  const onDelete = () => {
    apiWrapper(
      () => deleteOrganizationById(organization.id),
      () => {
        callback?.(organization);

        if (isDialog) {
          dialog.remove();
        }

        toast.success(
          t('success.delete_organization', {
            defaultValue: 'Organization deleted',
          }),
        );
      },
    );
  };

  return (
    <>
      <p>
        <Trans
          i18nKey="question.are_you_sure_to_delete_organization"
          values={{ name: organization.name }}
          defaults="Are you sure you want to delete <strong>{{name}}</strong> organization?"
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

export default DeleteOrganizationForm;
