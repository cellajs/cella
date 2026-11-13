import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as s3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '#/core/error';
import { getS3Client } from '#/lib/object-storage';

/**
 * Covers the client's 60-minute URL memo plus a media session's range requests; an issued URL outlives a removal by at most this.
 * @public
 */
export const urlLifetimeSeconds = 2 * 60 * 60;

/**
 * Types a browser shows without running a page: raster images (no SVG), audio, video and PDF. No `+` subtype: a `+xml`
 * type renders as an XML document.
 */
const inlineTypePattern = /^(?:image\/(?:png|jpeg|gif|webp|avif)|(?:audio|video)\/[a-z0-9][a-z0-9.-]*|application\/pdf)$/;

/**
 * A `Content-Disposition` naming the file (RFC 6266): `filename` in printable ASCII for every client, plus `filename*`
 * in UTF-8 (RFC 8187) when the ASCII form cannot hold the name as it is.
 */
function dispositionOf(type: 'inline' | 'attachment', filename: string | null): string {
  if (!filename) return type;
  const ascii = filename.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  if (ascii === filename) return `${type}; filename="${ascii}"`;
  // `'`, `(`, `)` and `*` are no attr-char (RFC 8187), and encodeURIComponent leaves them as they are.
  const encoded = encodeURIComponent(filename.toWellFormed()).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Presigns a two-hour download URL of an object in `bucketName` of Scaleway Object Storage, with the response type
 * and the file's name pinned in the signature: a `contentType` on the inline list is served inline as itself, anything
 * else as an `application/octet-stream` download. The type is the client's claim, so a page declared as an image opens
 * as a broken image, never as a page on the bucket's host. A `blob:` key names no stored object, only a browser's local
 * file: it throws, and is never signed.
 * @param filename - The name a browser saves the file under; null saves it under its key.
 */
export async function getSignedUrlFromKey(
  Key: string,
  { bucketName, contentType, filename }: { bucketName: string; contentType: string | null; filename: string | null },
): Promise<string> {
  if (Key.startsWith('blob:')) throw new AppError(500, 'server_error', 'error', { message: 'A blob: key names no stored object to sign' });

  const type = contentType?.toLowerCase() ?? '';
  const response = inlineTypePattern.test(type)
    ? { ResponseContentDisposition: dispositionOf('inline', filename), ResponseContentType: type }
    : { ResponseContentDisposition: dispositionOf('attachment', filename), ResponseContentType: 'application/octet-stream' };

  return s3SignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucketName, Key, ...response }), { expiresIn: urlLifetimeSeconds });
}
