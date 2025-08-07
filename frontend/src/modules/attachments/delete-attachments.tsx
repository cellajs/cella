import { useAttachmentDeleteMutation } from '~/modules/attachments/query-mutations';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { EntityPage } from '~/modules/entities/types';
import { isLocal } from '~/utils/is-cdn-url';
import { getAttachmentsCollection } from './table/helpers';
import { useTransaction } from './use-transaction';

interface Props {
  entity: EntityPage;
  attachments: LiveQueryAttachment[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<LiveQueryAttachment[]>) => void;
}

const DeleteAttachments = ({ attachments, entity, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation();

  const deleteAttachmens = useTransaction<string[]>({
    mutationFn: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (attachmentIds) => {
          try {
            console.log('🚀 ~ DeleteAttachments ~ attachmentIds:', attachmentIds);
            // await deleteAttachments({ body: { ids: attachmentIds }, path: { orgIdOrSlug } });
          } catch {
            // toaster(t('error:delete_resources', { resources: t('common:attachments') }), 'error');
            // else toaster(t(`error:${action}_resource`, { resource: t('common:attachment') }), 'error')
          }
        }),
      );
    },
  });
  const orgIdOrSlug = entity.membership?.organizationId || entity.id;

  const onDelete = async () => {
    const localDeletionIds: string[] = [];
    const serverDeletionIds: string[] = [];

    for (const attachment of attachments) {
      if (!isLocal(attachment.original_key)) serverDeletionIds.push(attachment.id);
      else localDeletionIds.push(attachment.id);
    }

    const attachmentCollection = getAttachmentsCollection(orgIdOrSlug);

    deleteAttachmens.mutate(() => attachmentCollection.delete(serverDeletionIds));
    // deleteAttachments({ localDeletionIds, serverDeletionIds, orgIdOrSlug });

    if (isDialog) removeDialog();
    callback?.({ data: attachments, status: 'success' });
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteAttachments;
