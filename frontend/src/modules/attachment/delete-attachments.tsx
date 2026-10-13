import type { Attachment } from 'sdk';
import { useAttachmentDeleteMutation } from '~/modules/attachment/query';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

interface Props {
  attachments: Attachment[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<Attachment[]>) => void;
  onCancel?: () => void;
}

export function DeleteAttachments({ attachments, callback, dialog: isDialog, onCancel }: Props) {
  const removeDialog = useDialoger((state) => state.remove);
  // All attachments belong to one organization, so the first one carries the ids.
  const { mutate: deleteAttachments, isPending } = useAttachmentDeleteMutation(attachments[0].tenantId, attachments[0].organizationId);

  // The delete is optimistic and queues offline, so the form does not wait for the server: the rows leave the list at
  // once, and a refusal puts them back with a toast.
  const onDelete = () => {
    deleteAttachments(attachments);
    if (isDialog) removeDialog();
    callback?.({ data: attachments, status: 'success' });
  };

  return <DeleteForm allowOfflineDelete onDelete={onDelete} onCancel={onCancel ?? (() => removeDialog())} pending={isPending} />;
}
