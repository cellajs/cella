import type { Page } from '~/api.gen';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { usePageDeleteMutation } from '~/modules/pages/query';

type Props = {
  pages: Page[];
  isDialog?: boolean;
  callback?: (args: CallbackArgs<Page[]>) => void;
};

const DeletePages = ({ pages, callback, isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const deletePage = usePageDeleteMutation();

  const handleDelete = async () => {
    await deletePage.mutateAsync(pages);
    if (isDialog) removeDialog();
    callback?.({ data: pages, status: 'success' });
  };

  return <DeleteForm onDelete={handleDelete} onCancel={() => removeDialog()} pending={deletePage.isPending} />;
};

export default DeletePages;
