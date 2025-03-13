import {
  getDefaultAttachmentCreateMutation,
  getDefaultAttachmentDeleteMutation,
  getDefaultAttachmentUpdateMutation,
} from '~/modules/attachments/query/default-mutations';
import { getDefaultMembershipDeleteMutation, getDefaultMembershipUpdateMutation } from '~/modules/memberships/query/default-mutations';

export const mutationDefaultArray = [
  getDefaultMembershipUpdateMutation,
  getDefaultMembershipDeleteMutation,
  getDefaultAttachmentCreateMutation,
  getDefaultAttachmentUpdateMutation,
  getDefaultAttachmentDeleteMutation,
];
