import { scwS3Endpoint } from './scw-fetch';

/** Presigned links to objects of one bucket, signed with the key given: whoever holds a link does that one call on that one object until it ends. */
export interface Presigner {
  get(key: string, seconds: number): Promise<string>;
  put(key: string, seconds: number): Promise<string>;
}

/**
 * A presigner for a Scaleway bucket. The client asks no checksum it cannot know: a PUT link signed with the checksum of an empty body refuses
 * every upload. Signing is local, so a link costs no call.
 */
export async function bucketPresigner(opts: { region: string; bucket: string; accessKey: string; secretKey: string }): Promise<Presigner> {
  const [{ GetObjectCommand, PutObjectCommand, S3Client }, { getSignedUrl }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/s3-request-presigner'),
  ]);
  const client = new S3Client({
    region: opts.region,
    endpoint: scwS3Endpoint(opts.region),
    credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
    forcePathStyle: false,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return {
    get: (key, seconds) => getSignedUrl(client, new GetObjectCommand({ Bucket: opts.bucket, Key: key }), { expiresIn: seconds }),
    put: (key, seconds) => getSignedUrl(client, new PutObjectCommand({ Bucket: opts.bucket, Key: key }), { expiresIn: seconds }),
  };
}

/** A presigned link's query marks it: anything that strips links from text recognizes them by it. */
const linkPattern = /https:\/\/[^\s"'\\]*X-Amz-Signature=[0-9a-f]+[^\s"'\\]*/g;

/** Text with every presigned link removed: what a machine's user data keeps once the machine booted. */
export function withoutLinks(text: string): string {
  return text.replace(linkPattern, '');
}
