import type { Attachment } from 'sdk';
import { hierarchy } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { shareLink } from '~/utils/share-link';

/**
 * The share link of a file, `/{code}/a7`: its home channel's code and its number. Null until the server numbers it,
 * while that channel is not cached, or in an app whose `numberedProducts` leaves attachments out.
 */
export const attachmentShareLink = (attachment: Pick<Attachment, 'number' | 'organizationId'>) => {
  if (!attachment.number) return null;
  const [home] = hierarchy.resolveNonNullAncestors('attachment', asRecord(attachment));
  const code = findInCache<{ id: string; code?: string }>(home?.type ?? 'organization', home?.id ?? attachment.organizationId)?.code;
  return code ? shareLink(code, { type: 'attachment', number: attachment.number }) : null;
};
