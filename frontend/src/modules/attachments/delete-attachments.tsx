import { useLoaderData } from '@tanstack/react-router';
import React from 'react';
import type { Attachment } from '~/api.gen';
import { ApiError } from '~/lib/api';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';

interface Props {
  attachments: Attachment[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<Attachment[]>) => void;
}

const DeleteAttachments = ({ attachments, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { attachmentsCollection, localAttachmentsCollection } = useLoaderData({ from: OrganizationAttachmentsRoute.id });

  const [isPending, setIsPending] = React.useState(false);
  // TODO(tanstackDB)
  const serverDeletionIds: string[] = attachments.filter(({ originalKey }) => originalKey.startsWith('blob:http')).map(({ id }) => id);
  const localDeletionIds: string[] = attachments.filter(({ originalKey }) => !originalKey.startsWith('blob:http')).map(({ id }) => id);

  const onDelete = async () => {
    setIsPending(true);
    try {
      attachmentsCollection.delete(serverDeletionIds);
      localAttachmentsCollection.delete(localDeletionIds);
      callback?.({ data: attachments, status: 'success' });
    } catch (error) {
      if (error instanceof Error || error instanceof ApiError) callback?.({ status: 'fail', error });
    } finally {
      callback?.({ status: 'settle' });
      if (isDialog) removeDialog();
      setIsPending(false);
    }
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteAttachments;
