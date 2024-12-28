import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useAttachmentDeleteMutation } from '~/query/mutations/attachments';
import type { Attachment } from '~/types/common';

interface Props {
  organizationId: string;
  attachments: Attachment[];
  callback?: (attachments: Attachment[]) => void;
  dialog?: boolean;
}

const RemoveAttachmentsForm = ({ attachments, organizationId, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation();

  const onRemove = () => {
    deleteAttachments({
      orgIdOrSlug: organizationId,
      ids: attachments.map((a) => a.id),
    });
    if (isDialog) dialog.remove();
    callback?.(attachments);
  };

  return <DeleteForm onDelete={onRemove} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default RemoveAttachmentsForm;
