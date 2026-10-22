import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describe, expect, it } from 'vitest';
import { presignGetObject } from './presign-get-object';

// AWS's documentation example keys: signing is local, so any key pair signs.
const accessKeyId = 'AKIDEXAMPLE';
const secretAccessKey = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';

/** The URL `@aws-sdk/s3-request-presigner` signs for the same object, the reference this signer replaces. */
const sdkUrl = (host: string, region: string, bucket: string, key: string, expiresIn: number, date: Date) =>
  getSignedUrl(
    new S3Client({ region, endpoint: `https://${host}`, credentials: { accessKeyId, secretAccessKey } }),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn, signingDate: date },
  );

describe('presignGetObject', () => {
  it.each([
    ['s3.nl-ams.scw.cloud', 'nl-ams', 'private-bucket', 'org/attachments/original/a.jpg', 86400, '2026-10-20T12:34:56Z'],
    ['s3.nl-ams.scw.cloud', 'nl-ams', 'cella-private', "a b+c%d/ü é~(1)!*'.png", 300, '2026-01-01T00:00:00Z'],
    ['s3.fr-par.scw.cloud', 'fr-par', 'raak-files', 'tenant/7f3e/attachments/converted/report final (2).pdf', 604800, '2027-02-28T23:59:59Z'],
    ['s3.nl-ams.scw.cloud', 'nl-ams', 'private-bucket', 'deep/path/with//empty/segment&query=1#hash.txt', 1, '2026-10-20T08:00:00Z'],
  ])('signs the URL the AWS SDK signs for %s %s %s %s', async (host, region, bucket, key, expiresIn, at) => {
    const date = new Date(at);
    const ours = presignGetObject({ host, region, bucket, key, accessKeyId, secretAccessKey, expiresIn, date });

    expect(ours).toBe(await sdkUrl(host, region, bucket, key, expiresIn, date));
  });

  it('rejects an expiry beyond the 7 days S3 accepts', () => {
    const options = { host: 's3.nl-ams.scw.cloud', region: 'nl-ams', bucket: 'b', key: 'k', accessKeyId, secretAccessKey };
    expect(() => presignGetObject({ ...options, expiresIn: 604801 })).toThrow(RangeError);
  });
});
