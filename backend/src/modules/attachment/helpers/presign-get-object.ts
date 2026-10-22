import { createHash, createHmac } from 'node:crypto';

interface PresignGetObjectOptions {
  /** S3 endpoint host; the URL is virtual-hosted: `<bucket>.<host>`. */
  host: string;
  region: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Seconds the URL stays valid, at most 7 days (S3's limit). */
  expiresIn: number;
  /** Signing time; now by default. */
  date?: Date;
}

/** RFC 3986 encoding, which SigV4 requires: `encodeURIComponent` plus the five characters it leaves alone. */
const encodeRfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/**
 * A presigned GET URL for one object, signed with AWS Signature Version 4 in the query string (UNSIGNED-PAYLOAD).
 * Signing is local computation: no request is sent. The query carries what the AWS SDK's GetObject presign carries,
 * `x-amz-checksum-mode` and `x-id` included, so the URL is the one the SDK would sign.
 */
export function presignGetObject({
  host,
  region,
  bucket,
  key,
  accessKeyId,
  secretAccessKey,
  expiresIn,
  date = new Date(),
}: PresignGetObjectOptions): string {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 604800) throw new RangeError('expiresIn must be 1 to 604800 seconds');

  const amzDate = date.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const objectHost = `${bucket}.${host}`;
  const path = `/${key.split('/').map(encodeRfc3986).join('/')}`;

  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'host'],
    ['x-amz-checksum-mode', 'ENABLED'],
    ['x-id', 'GetObject'],
  ];
  // Sorted by name, as the canonical request requires; the URL keeps the same order.
  const queryString = (pairs: string[][]) =>
    pairs
      .map(([name, value]) => [encodeRfc3986(name), encodeRfc3986(value)])
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, value]) => `${name}=${value}`)
      .join('&');

  const canonicalRequest = ['GET', path, queryString(query), `host:${objectHost}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), 's3'), 'aws4_request');
  const signature = hmac(signingKey, stringToSign).toString('hex');

  return `https://${objectHost}${path}?${queryString([...query, ['X-Amz-Signature', signature]])}`;
}
