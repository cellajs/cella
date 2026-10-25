import type { Attachment } from 'sdk';
import { getFirstName } from 'shared/utils/get-first-name';
import { hasCloudFile } from 'shared/utils/storage-key';
import type { TKey } from '~/lib/i18n-locales';
import { userStore } from '~/modules/user/user-store';

/** An attachment whose file has not reached storage yet, seen from a device that does not hold it. */
export interface PendingUpload {
  uploader: Attachment['createdBy'];
}

/** The attachment's file is only on its uploader's device: nothing to retry until it uploads. */
export class PendingUploadError extends Error {
  constructor(readonly attachmentId: string) {
    super(`Attachment ${attachmentId} is not uploaded yet`);
    this.name = 'PendingUploadError';
  }
}

export const isPendingUpload = (attachment: Pick<Attachment, 'keys'>) => !hasCloudFile(attachment.keys);

const pendingUploads = new Map<string, PendingUpload>();
const listeners = new Set<() => void>();

export const markPendingUpload = (attachmentId: string, uploader: Attachment['createdBy']): void => {
  pendingUploads.set(attachmentId, { uploader });
};

export const getPendingUpload = (attachmentId: string) => pendingUploads.get(attachmentId);

/** The pending upload a media block names: by its `attachmentId` prop, or by an id-shaped `url` from before that prop. */
export const getBlockPendingUpload = (props: Record<string, unknown>) => {
  const ref = (typeof props.attachmentId === 'string' && props.attachmentId) || (typeof props.url === 'string' && props.url);
  return ref ? pendingUploads.get(ref) : undefined;
};

/** Drops the attachments whose file `isStored` now finds in storage and tells subscribers, so placeholders turn into files. */
export const clearStoredUploads = (isStored: (attachmentId: string) => boolean): void => {
  let cleared = false;
  for (const id of pendingUploads.keys()) {
    if (!isStored(id)) continue;
    pendingUploads.delete(id);
    cleared = true;
  }
  if (cleared) for (const listener of listeners) listener();
};

export const hasPendingUploads = () => pendingUploads.size > 0;

/** Called when any pending attachment's file arrives in storage. */
export const subscribePendingUploads = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** What a placeholder says: whose device holds the file. */
export const pendingUploadMessage = ({ uploader }: PendingUpload): { key: TKey; params?: { name: string } } => {
  if (uploader && uploader.id === userStore.getState().user?.id) return { key: 'c:only_on_your_other_device' };
  const name = getFirstName(uploader?.name);
  return name ? { key: 'c:only_on_device', params: { name } } : { key: 'c:not_uploaded_yet' };
};
