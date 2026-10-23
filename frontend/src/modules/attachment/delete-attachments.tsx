import type { Attachment } from 'sdk';
import { useAttachmentDeleteMutation } from '~/modules/attachment/query';
import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';

interface DeleteAttachmentsProps extends Pick<DeleteItemsProps<Attachment, Attachment[]>, 'dialog' | 'callback' | 'onCancel'> {
  attachments: Attachment[];
}

export function DeleteAttachments({ attachments, ...props }: DeleteAttachmentsProps) {
  // All attachments belong to one organization, so the first one carries the ids.
  const mutation = useAttachmentDeleteMutation(attachments[0].tenantId, attachments[0].organizationId);

  // The rows leave the list at once and a refusal puts them back with a toast, so the form does not wait for the server.
  return <DeleteItems items={attachments} mutation={mutation} toVariables={(items) => items} optimistic {...props} />;
}
