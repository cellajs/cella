import { isFileLocal } from '~/modules/attachments/helpers/is-local-file';
import { getAttachmentsCollection, getLocalAttachmentsCollection } from '~/modules/attachments/query';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { EntityPage } from '~/modules/entities/types';

interface Props {
  entity: EntityPage;
  attachments: LiveQueryAttachment[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<LiveQueryAttachment[]>) => void;
}

const DeleteAttachments = ({ entity, attachments, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);

  const orgIdOrSlug = entity.membership?.organizationId || entity.id;

  const { collection: attachmentCollection } = getAttachmentsCollection(orgIdOrSlug);
  const localAttachmentCollection = getLocalAttachmentsCollection(orgIdOrSlug);

  const onDelete = async () => {
    const localDeletionIds: string[] = [];
    const serverDeletionIds: string[] = [];

    for (const attachment of attachments) {
      if (isFileLocal(attachment.original_key)) localDeletionIds.push(attachment.id);
      else serverDeletionIds.push(attachment.id);
    }

    if (serverDeletionIds.length) attachmentCollection.delete(serverDeletionIds);
    if (localDeletionIds.length) localAttachmentCollection.delete(localDeletionIds);

    if (isDialog) removeDialog();
    callback?.({ data: attachments, status: 'success' });
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={false} />;
};

export default DeleteAttachments;
