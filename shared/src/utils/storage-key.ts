import { isUuid } from './entity-id.ts';

/**
 * A local blob URL as a browser mints it for a file not yet uploaded: `blob:`, an http(s) origin and a UUID path, in
 * canonical form, so no dot segment, userinfo or query rides along. It names no stored object.
 */
const isLocalBlobUrl = (key: string): boolean => {
  if (!key.startsWith('blob:')) return false;
  try {
    const url = new URL(key.slice('blob:'.length));
    return (url.protocol === 'http:' || url.protocol === 'https:') && isUuid(url.pathname.slice(1)) && key === `blob:${url.origin}${url.pathname}`;
  } catch {
    return false;
  }
};

/** An offline upload keeps its local blob URL, or nothing, until it syncs: neither names a stored object. */
export const isLocalStorageKey = (key: string) => key === '' || isLocalBlobUrl(key);

/** Whether an attachment's file reached storage; until it does, only the uploader's device holds it. */
export const hasCloudFile = (keys: { original: string }) => !isLocalStorageKey(keys.original);
