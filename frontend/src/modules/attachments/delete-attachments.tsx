import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { useAttachmentDeleteMutation } from '~/modules/attachments/query-mutations';
import type { Attachment } from '~/modules/attachments/types';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { EntityPage } from '~/modules/entities/types';

interface Props {
  entity: EntityPage;
  attachments: Attachment[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<Attachment[]>) => void;
}

const DeleteAttachments = ({ attachments, entity, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation();

  const orgIdOrSlug = entity.membership?.organizationId || entity.id;

  const onDelete = async () => {
    const ids = attachments.map(({ id }) => id);
    // Remove locally stored files
    const attachmentIds = await LocalFileStorage.removeFiles(ids);
    deleteAttachments({ ...attachmentIds, orgIdOrSlug });

    if (isDialog) removeDialog();
    callback?.({ data: attachments, status: 'success' });
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteAttachments;
