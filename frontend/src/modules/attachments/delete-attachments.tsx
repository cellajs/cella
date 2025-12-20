import type { Attachment } from '~/api.gen';
import { useAttachmentDeleteMutation } from '~/modules/attachments/query-mutations';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { ContextEntityData } from '~/modules/entities/types';
import { isCDNUrl } from '~/utils/is-cdn-url';

interface Props {
  entity: ContextEntityData;
  attachments: Attachment[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<Attachment[]>) => void;
}

const DeleteAttachments = ({ attachments, entity, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation();

  const orgIdOrSlug = entity.membership?.organizationId || entity.id;

  const onDelete = async () => {
    const localDeletionIds: string[] = [];
    const serverDeletionIds: string[] = [];

    for (const attachment of attachments) {
      if (isCDNUrl(attachment.url)) serverDeletionIds.push(attachment.id);
      else localDeletionIds.push(attachment.id);
    }
    deleteAttachments({ localDeletionIds, serverDeletionIds, orgIdOrSlug });

    if (isDialog) removeDialog();
    callback?.({ data: attachments, status: 'success' });
  };

  return (
    <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />
  );
};

export default DeleteAttachments;
