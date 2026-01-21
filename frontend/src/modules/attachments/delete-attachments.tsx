import React from 'react';
import type { Attachment } from '~/api.gen';
import { ApiError } from '~/lib/api';
import { useAttachmentDeleteMutation } from '~/modules/attachments/query';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

interface Props {
  attachments: Attachment[];
  organizationSlug: string;
  dialog?: boolean;
  callback?: (args: CallbackArgs<Attachment[]>) => void;
}

function DeleteAttachments({ attachments, organizationSlug, callback, dialog: isDialog }: Props) {
  const removeDialog = useDialoger((state) => state.remove);
  const deleteAttachments = useAttachmentDeleteMutation(organizationSlug);

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

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
}

export default DeleteAttachments;
