import { t } from 'i18next';
import { deleteAttachments } from '~/api.gen';
import { isFileLocal } from '~/modules/attachments/helpers/is-local-file';
import { getAttachmentsCollection, getLocalAttachmentsCollection } from '~/modules/attachments/query';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import { useTransaction } from '~/modules/attachments/use-transaction';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
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

  const attachmentCollection = getAttachmentsCollection(orgIdOrSlug);
  attachmentCollection.startSyncImmediate();

  const localAttachmentCollection = getLocalAttachmentsCollection(orgIdOrSlug);
  localAttachmentCollection.startSyncImmediate();

  const deleteAttachmens = useTransaction<LiveQueryAttachment[]>({
    mutationFn: async ({ transaction }) => {
      const ids: string[] = [];
      for (const { changes } of transaction.mutations) {
        if (changes && 'id' in changes && typeof changes.id === 'string') ids.push(changes.id);
      }
      try {
        await deleteAttachments({ body: { ids }, path: { orgIdOrSlug } });
      } catch (err) {
        if (ids.length > 1) toaster(t('error:delete_resources', { resources: t('common:attachments') }), 'error');
        else toaster(t('error:delete_resource', { resource: t('common:attachment') }), 'error');
      }
    },
  });

  const onDelete = async () => {
    const localDeletionIds: string[] = [];
    const serverDeletionIds: string[] = [];

    for (const attachment of attachments) {
      if (isFileLocal(attachment.original_key)) localDeletionIds.push(attachment.id);
      else serverDeletionIds.push(attachment.id);
    }

    if (serverDeletionIds.length) deleteAttachmens.mutate(() => attachmentCollection.delete(serverDeletionIds));
    if (localDeletionIds.length) localAttachmentCollection.delete(localDeletionIds);

    if (isDialog) removeDialog();
    callback?.({ data: attachments, status: 'success' });
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={false} />;
};

export default DeleteAttachments;
