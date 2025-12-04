import { deletePages, type Page } from '~/api.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useTableMutation } from './utils/mutations';

type DeletePagesFormProps = {
  pages: Page[];
  isDialog?: boolean;
  callback?: (args: CallbackArgs<Page[]>) => void;
};

const DeletePagesForm = ({ pages, callback, isDialog }: DeletePagesFormProps) => {
  const removeDialog = useDialoger((state) => state.remove);

  const mutation = useTableMutation({
    table: 'pages',
    type: 'create',
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map(({ id }) => id);
      return await deletePages({ body: { ids } });
    },
  });

  return (
    <DeleteForm
      onDelete={() => {
        mutation.mutate(pages, {
          onSuccess: (_, data) => {
            if (isDialog) removeDialog();
            callback?.({ data, status: 'success' });
          },
        });
      }}
      onCancel={() => removeDialog()}
      pending={mutation.isPending}
    />
  );
};

export default DeletePagesForm;
