/**
 * Ensure the Pulumi state bucket exists (chicken-and-egg: Pulumi can't manage
 * the bucket its own state lives in). Idempotent.
 *
 * Usage:  tsx infra/tasks/ensure-state-bucket.ts
 * Env:    SCW_ACCESS_KEY, SCW_SECRET_KEY
 */
import { pathToFileURL } from 'node:url'
import { CreateBucketCommand, HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3'

export type EnsureResult = 'exists' | 'created'

/**
 * Returns 'exists' if the bucket is already present (or HEAD returns ambiguous
 * 403 but the subsequent CreateBucket reports BucketAlreadyOwnedByYou). Returns
 * 'created' on a fresh creation. Throws on every other error, including the
 * fatal "name taken by another account".
 */
export async function ensureStateBucket(s3: S3Client, bucketName: string): Promise<EnsureResult> {
  const headResult = await s3
    .send(new HeadBucketCommand({ Bucket: bucketName }))
    .then(() => true)
    .catch((err: { $metadata?: { httpStatusCode?: number } }) => {
      const status = err.$metadata?.httpStatusCode
      // 403 is ambiguous on Scaleway (foreign-owned, missing perms, stale
      // reservation); fall through to CreateBucket for an authoritative answer.
      if (status === 404 || status === 301 || status === 403) return false
      throw err
    })

  if (headResult) return 'exists'

  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }))
    return 'created'
  } catch (err: unknown) {
    const name = (err as { name?: string }).name
    if (name === 'BucketAlreadyOwnedByYou') return 'exists'
    if (name === 'BucketAlreadyExists') {
      throw new Error(
        `Bucket name "${bucketName}" is taken by another account. Pick a different slug or rename in shared/default-config.ts.`,
      )
    }
    throw err
  }
}

async function main() {
  const { S3Client } = await import('@aws-sdk/client-s3')
  const accessKey = process.env.SCW_ACCESS_KEY
  const secretKey = process.env.SCW_SECRET_KEY
  if (!accessKey || !secretKey) {
    console.error('SCW_ACCESS_KEY and SCW_SECRET_KEY must be set')
    process.exit(1)
  }
  process.env.APP_MODE = process.env.APP_MODE ?? 'production'
  const { appConfig } = await import('shared')
  const bucketName = `${appConfig.slug}-pulumi-state`
  const region = appConfig.s3.region
  const s3 = new S3Client({
    region,
    endpoint: `https://s3.${region}.scw.cloud`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  })
  const result = await ensureStateBucket(s3, bucketName)
  if (result === 'exists') console.info(`Pulumi state bucket already exists: s3://${bucketName} (${region})`)
  else console.info(`Created Pulumi state bucket: s3://${bucketName} (${region})`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
