import React from 'react';
import type { Attachment } from '~/api.gen';
import { ApiError } from '~/lib/api';
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
  // Use tenantId and organizationId from first attachment - all attachments belong to same org
  const deleteAttachments = useAttachmentDeleteMutation(attachments[0].tenantId, attachments[0].organizationId);

  const [isPending, setIsPending] = React.useState(false);

  const onDelete = async () => {
    setIsPending(true);
    try {
      await deleteAttachments.mutateAsync(attachments);
      callback?.({ data: attachments, status: 'success' });
    } catch (error) {
      if (error instanceof Error || error instanceof ApiError) callback?.({ status: 'fail', error });
    } finally {
      callback?.({ status: 'settle' });
      if (isDialog) removeDialog();
      setIsPending(false);
    }
  };

  return <DeleteForm onDelete={onDelete} onCancel={onCancel ?? (() => removeDialog())} pending={isPending} />;
}
