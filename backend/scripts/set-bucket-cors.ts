import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { appConfig } from 'shared';
import { env } from '#/env';
import { checkMark, crossMark, startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';

// Origins to authorize. Accept a comma-separated CLI arg, else fall back to the
// configured frontend URL (e.g. http://localhost:3000 in development).
const originArg = process.argv[2];
const allowedOrigins = (originArg ?? appConfig.frontendUrl)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Buckets to configure: the two shared development buckets.
const buckets = [appConfig.s3.publicBucket, appConfig.s3.privateBucket];

// CORS rule tuned for browser reads: GET/HEAD plus the headers PDF.js needs for
// range requests. Exposed headers let the browser read content length/range.
const corsConfiguration = {
  CORSRules: [
    {
      AllowedOrigins: allowedOrigins,
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'HEAD'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
      MaxAgeSeconds: 3600,
    },
  ],
};

const s3Client = new S3Client({
  region: appConfig.s3.region,
  endpoint: `https://${appConfig.s3.host}`,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_ACCESS_KEY_SECRET,
  },
});

async function applyCors(bucket: string): Promise<void> {
  startSpinner(`Setting CORS on ${bucket}...`);

  await s3Client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: corsConfiguration }));

  // Read back to confirm what the bucket now reports.
  const current = await s3Client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  const origins = current.CORSRules?.flatMap((r) => r.AllowedOrigins ?? []) ?? [];
  succeedSpinner(`${checkMark} ${bucket} → allowed origins: ${origins.join(', ')}`);
}

async function main(): Promise<void> {
  if (!env.S3_ACCESS_KEY_ID || !env.S3_ACCESS_KEY_SECRET) {
    console.error(`${crossMark} S3_ACCESS_KEY_ID / S3_ACCESS_KEY_SECRET are not set in backend/.env`);
    process.exit(1);
  }

  console.info(`Applying CORS to ${buckets.length} bucket(s) for origin(s): ${allowedOrigins.join(', ')}`);

  for (const bucket of buckets) {
    try {
      await applyCors(bucket);
    } catch (err) {
      warnSpinner(`${crossMark} ${bucket}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
