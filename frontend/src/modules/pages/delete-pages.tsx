import type { Page } from '~/api.gen';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { initPagesCollection } from '~/modules/pages/collections';

type Props = {
  pages: Page[];
  pagesCollection: ReturnType<typeof initPagesCollection>;
  isDialog?: boolean;
  callback?: (args: CallbackArgs<Page[]>) => void;
};

const DeletePages = ({ pages, pagesCollection, callback, isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);

  const handleDelete = () => {
    // Use collection for optimistic delete - syncs automatically via onDelete callback
    for (const page of pages) {
      pagesCollection.delete(page.id);
    }
    if (isDialog) removeDialog();
    callback?.({ data: pages, status: 'success' });
  };

  return <DeleteForm onDelete={handleDelete} onCancel={() => removeDialog()} pending={false} />;
};

export default DeletePages;
