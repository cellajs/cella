import type { Collection } from '@tanstack/react-db';
import { t } from 'i18next';
import { deleteAttachments } from '~/api.gen';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import { useTransaction } from '~/modules/attachments/use-transaction';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import type { EntityPage } from '~/modules/entities/types';
import { isLocal } from '~/utils/is-cdn-url';

interface Props {
  entity: EntityPage;
  attachmentCollection: Collection<LiveQueryAttachment>;
  localAttachmentCollection: Collection<LiveQueryAttachment>;
  attachments: LiveQueryAttachment[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<LiveQueryAttachment[]>) => void;
}

const DeleteAttachments = ({ entity, attachments, attachmentCollection, localAttachmentCollection, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const orgIdOrSlug = entity.membership?.organizationId || entity.id;

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

  const deleteLocalAttachmens = useTransaction<LiveQueryAttachment[]>({
    mutationFn: async ({ transaction }) => {
      const storedIds: string[] = [];
      for (const { changes } of transaction.mutations) {
        if (changes && 'id' in changes && typeof changes.id === 'string') storedIds.push(changes.id);
      }
      try {
        await LocalFileStorage.removeFiles(storedIds);
      } catch (err) {
        console.error('Sync files deletion error:', err);
      }
    },
  });

  const onDelete = async () => {
    const localDeletionIds: string[] = [];
    const serverDeletionIds: string[] = [];

    for (const attachment of attachments) {
      if (!isLocal(attachment.original_key)) serverDeletionIds.push(attachment.id);
      else localDeletionIds.push(attachment.id);
    }

    if (serverDeletionIds.length) deleteAttachmens.mutate(() => attachmentCollection.delete(serverDeletionIds));
    if (localDeletionIds.length) deleteLocalAttachmens.mutate(() => localAttachmentCollection.delete(localDeletionIds));

    if (isDialog) removeDialog();
    callback?.({ data: attachments, status: 'success' });
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={false} />;
};

export default DeleteAttachments;
