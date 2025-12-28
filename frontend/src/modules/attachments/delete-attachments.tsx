import { useLoaderData } from '@tanstack/react-router';
import React from 'react';
import type { Attachment } from '~/api.gen';
import { ApiError } from '~/lib/api';
import { useOfflineAttachments } from '~/modules/attachments/offline';
import { isLocalAttachment } from '~/modules/attachments/utils';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';

interface Props {
  attachments: Attachment[];
  organizationId: string;
  dialog?: boolean;
  callback?: (args: CallbackArgs<Attachment[]>) => void;
}

const DeleteAttachments = ({ attachments, organizationId, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { attachmentsCollection, localAttachmentsCollection } = useLoaderData({
    from: OrganizationAttachmentsRoute.id,
  });

  // Use offline executor for server attachment deletions
  const { deleteOffline } = useOfflineAttachments({
    attachmentsCollection,
    organizationId,
  });

  const [isPending, setIsPending] = React.useState(false);

  // Separate local (blob) attachments from server attachments
  const localDeletionIds: string[] = attachments
    .filter(({ originalKey }) => isLocalAttachment(originalKey))
    .map(({ id }) => id);
  const serverDeletionIds: string[] = attachments
    .filter(({ originalKey }) => !isLocalAttachment(originalKey))
    .map(({ id }) => id);

  const onDelete = async () => {
    setIsPending(true);
    try {
      // Delete server attachments via offline executor (handles sync)
      if (serverDeletionIds.length > 0) {
        await deleteOffline(serverDeletionIds);
      }
      // Delete local attachments directly (not synced to server yet)
      if (localDeletionIds.length > 0) {
        localAttachmentsCollection.delete(localDeletionIds);
      }
      callback?.({ data: attachments, status: 'success' });
    } catch (error) {
      if (error instanceof Error || error instanceof ApiError) callback?.({ status: 'fail', error });
    } finally {
      callback?.({ status: 'settle' });
      if (isDialog) removeDialog();
      setIsPending(false);
    }
  };

  return (
    <DeleteForm allowOfflineDelete={true} onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />
  );
};

export default DeleteAttachments;
