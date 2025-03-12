import { useAttachmentDeleteMutation } from '~/modules/attachments/query-mutations';
import type { Attachment } from '~/modules/attachments/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import type { EntityPage } from '~/modules/entities/types';

interface Props {
  entity: EntityPage;
  attachments: Attachment[];
  callback?: (attachments: Attachment[]) => void;
  dialog?: boolean;
}

const RemoveAttachmentsForm = ({ attachments, entity, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation();

  const orgIdOrSlug = entity.membership?.organizationId || entity.id;

  const onRemove = async () => {
    deleteAttachments({ ids: attachments.map(({ id }) => id), orgIdOrSlug });

    if (isDialog) dialog.remove();
    callback?.(attachments);
  };

  return <DeleteForm onDelete={onRemove} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default RemoveAttachmentsForm;
