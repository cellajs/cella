import { useAttachmentDeleteMutation } from '~/modules/attachments/query/mutations';
import type { Attachment } from '~/modules/attachments/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import type { EntityPage } from '~/modules/entities/types';

interface Props {
  entity: EntityPage;
  attachments: Attachment[];
  dialog?: boolean;
  callback?: (attachments: Attachment[]) => void;
}

const DeleteAttachmentsForm = ({ attachments, entity, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation();

  const orgIdOrSlug = entity.membership?.organizationId || entity.id;

  const onDelete = async () => {
    deleteAttachments({ ids: attachments.map(({ id }) => id), orgIdOrSlug });

    if (isDialog) removeDialog();
    callback?.(attachments);
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteAttachmentsForm;
