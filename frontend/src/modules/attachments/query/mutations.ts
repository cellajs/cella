import { useMutation } from '@tanstack/react-query';
import {
  type CreateAttachmentParams,
  type DeleteAttachmentsParams,
  type UpdateAttachmentParams,
  createAttachments,
  deleteAttachments,
  updateAttachment,
} from '~/modules/attachments/api';
import { attachmentsKeys } from '~/modules/attachments/query/options';
import type { Attachment } from '~/modules/attachments/types';

export const useAttachmentCreateMutation = () =>
  useMutation<Attachment[], Error, CreateAttachmentParams>({
    mutationKey: attachmentsKeys.create(),
    mutationFn: createAttachments,
  });

export const useAttachmentUpdateMutation = () =>
  useMutation<Attachment, Error, UpdateAttachmentParams>({
    mutationKey: attachmentsKeys.update(),
    mutationFn: updateAttachment,
  });

export const useAttachmentDeleteMutation = () =>
  useMutation<boolean, Error, DeleteAttachmentsParams>({
    mutationKey: attachmentsKeys.delete(),
    mutationFn: deleteAttachments,
  });
