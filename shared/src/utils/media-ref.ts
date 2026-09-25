import { appConfig } from '../config-builder/app-config.ts';
import { isOriginIn } from './url-origin.ts';

/**
 * What a media block's `url` may reference. An upload is named by its attachment id or by a storage key under the
 * document's own organization; re-hosted media by its URL on the asset CDN. Everything else, an external URL included,
 * is `invalid` and renders nothing.
 */
export type MediaRef =
  | { kind: 'attachment'; id: string }
  | { kind: 'orgKey'; key: string }
  | { kind: 'asset'; url: string }
  | { kind: 'invalid' };

/** The document a reference sits in. */
export interface MediaRefContext {
  /** Organization whose upload prefix an `orgKey` must lie under; without one no key is valid. */
  organizationId?: string | null;
}

/** `.` and `..` segments, also percent-encoded: a URL resolving the key would climb out of the prefix. */
const isDotSegment = (segment: string) => ['.', '..'].includes(segment.toLowerCase().replaceAll('%2e', '.'));

/**
 * A backslash or an encoded slash, which a resolver may treat as a path separator, or a control character, which a URL
 * parser drops (so `.\t.` resolves as `..`).
 */
const separatorLikePattern = /[\\\p{Cc}]|%2f|%5c/iu;

/**
 * Whether `key` lies under the organization's upload prefix. The upload token signs `<organizationId>/<userId>` as the
 * storage path, so every object the app stores for an organization starts there; a leading slash is tolerated.
 */
export function isOrganizationKey(key: string, organizationId: string): boolean {
  const path = key.startsWith('/') ? key.slice(1) : key;
  if (!organizationId || !path.startsWith(`${organizationId}/`) || separatorLikePattern.test(path)) return false;
  return !path.split('/').some(isDotSegment);
}

/** Attachment ids are UUIDs: hex groups only, so one never reads as a URL or a path. */
const attachmentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An asset is an immutable content-hash object at the CDN root: a SHA-256 hex name with a raster extension. */
const assetPathPattern = /^\/[0-9a-f]{64}\.(?:webp|png)$/;

/** An asset URL in canonical form only (origin plus path), so the string checked is the URL a browser requests. */
const isAssetUrl = (ref: string): boolean => {
  const origin = appConfig.mediaAssetOrigin;
  if (!origin || !isOriginIn(ref, [origin])) return false;
  const url = new URL(ref);
  return ref === `${url.origin}${url.pathname}` && assetPathPattern.test(url.pathname);
};

/** Classifies a media block reference for the document described by `ctx`. */
export function parseMediaRef(ref: string, ctx: MediaRefContext): MediaRef {
  if (attachmentIdPattern.test(ref)) return { kind: 'attachment', id: ref };
  if (ctx.organizationId && isOrganizationKey(ref, ctx.organizationId)) return { kind: 'orgKey', key: ref };
  if (isAssetUrl(ref)) return { kind: 'asset', url: ref };
  return { kind: 'invalid' };
}
