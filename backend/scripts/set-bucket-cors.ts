import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { appConfig } from 'shared';
import { env } from '#/env';
import { checkMark, crossMark, startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';

// Origins to add. Accept a comma-separated CLI arg, else the configured frontend URL, which in a worktree or an
// app with a port offset carries that offset.
const originArg = process.argv[2];
const requestedOrigins = [...new Set((originArg?.split(',') ?? [appConfig.frontendUrl]).map((o) => o.trim()).filter(Boolean))];

// Buckets to configure: the two shared development buckets.
const buckets = [appConfig.s3.publicBucket, appConfig.s3.privateBucket];

// CORS rule tuned for browser reads: GET/HEAD plus the headers PDF.js needs for
// range requests. Exposed headers let the browser read content length/range.
const corsRule = (origins: string[]) => ({
  AllowedOrigins: origins,
  AllowedHeaders: ['*'],
  AllowedMethods: ['GET', 'HEAD'],
  ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
  MaxAgeSeconds: 3600,
});

const s3Client = new S3Client({
  region: appConfig.s3.region,
  endpoint: `https://${appConfig.s3.host}`,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_ACCESS_KEY_SECRET,
  },
});

/** Origins the bucket allows now; a bucket without a CORS configuration allows none. */
async function readOrigins(bucket: string): Promise<string[]> {
  try {
    const current = await s3Client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    return [...new Set(current.CORSRules?.flatMap((r) => r.AllowedOrigins ?? []) ?? [])];
  } catch (err) {
    if (err instanceof Error && err.name === 'NoSuchCORSConfiguration') return [];
    throw err;
  }
}

// Every app and checkout that shares these buckets adds its own origin, so a run keeps the origins already allowed.
async function addOrigins(bucket: string): Promise<void> {
  startSpinner(`Adding CORS origins on ${bucket}...`);

  const before = await readOrigins(bucket);
  const added = requestedOrigins.filter((origin) => !before.includes(origin));
  if (added.length) {
    await s3Client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [corsRule([...before, ...added])] } }));
  }

  // Read back to report what the bucket now allows.
  const after = await readOrigins(bucket);
  succeedSpinner(`${checkMark} ${bucket}: ${added.length ? `added ${added.join(', ')}` : 'nothing to add'}. Allowed origins:`);
  for (const origin of after.toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    console.info(`    ${origin}${added.includes(origin) ? '  (added)' : ''}`);
  }
}

async function main(): Promise<void> {
  if (!env.S3_ACCESS_KEY_ID || !env.S3_ACCESS_KEY_SECRET) {
    console.error(`${crossMark} S3_ACCESS_KEY_ID / S3_ACCESS_KEY_SECRET are not set in backend/.env`);
    process.exit(1);
  }

  console.info(`Adding origin(s) ${requestedOrigins.join(', ')} to CORS on ${buckets.length} bucket(s)`);

  for (const bucket of buckets) {
    try {
      await addOrigins(bucket);
    } catch (err) {
      warnSpinner(`${crossMark} ${bucket}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
