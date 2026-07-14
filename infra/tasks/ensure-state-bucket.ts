import { isMain } from '../lib/utils/is-main'
import { CreateBucketCommand, HeadBucketCommand, ListBucketsCommand, type S3Client } from '@aws-sdk/client-s3'
import { scwFetch, type ScwAuth } from '../lib/scaleway/scw-fetch'
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env'

export type EnsureResult = 'exists' | 'created'

/**
 * Guard against the wrong-project trap: Scaleway Object Storage pins an API
 * key to its `default_project_id` — bucket creation lands there and buckets in
 * other projects are unreachable regardless of IAM grants (bucket policies
 * cannot bridge projects either). A bootstrap key created as a Personal API
 * Key defaults to the ORG's default project, so without this check the state
 * bucket silently lands where the project-scoped CI key can never reach it.
 * Returns the error message, or undefined when aligned. Pure decision core;
 * the IAM lookup lives in {@link keyPreferredProject}.
 */
export function keyProjectMismatch(keyProjectId: string, expectedProjectId: string, accessKey: string): string | undefined {
  if (keyProjectId === expectedProjectId) return undefined
  return (
    `API key ${accessKey} has preferred project ${keyProjectId}, but this app deploys to project ${expectedProjectId}. ` +
    `Scaleway Object Storage follows the key's preferred project, so the state bucket would land out of reach of the CI deploy key. ` +
    `Fix: Scaleway console → IAM → API keys → ${accessKey} → change the preferred project, or ` +
    `PATCH https://api.scaleway.com/iam/v1alpha1/api-keys/${accessKey} {"default_project_id":"${expectedProjectId}"} — then re-run.`
  )
}

/** The key's own `default_project_id`, via IAM self-inspection. */
export async function keyPreferredProject(auth: ScwAuth, accessKey: string): Promise<string> {
  const key = await scwFetch<{ default_project_id: string }>(auth, 'GET', `https://api.scaleway.com/iam/v1alpha1/api-keys/${accessKey}`)
  return key.default_project_id
}

/**
 * Returns 'exists' if the bucket is already present (or HEAD returns ambiguous
 * 403 but the subsequent CreateBucket reports BucketAlreadyOwnedByYou). Returns
 * 'created' on a fresh creation. Throws on every other error, including the
 * fatal "name taken by another account".
 */
export async function ensureStateBucket(s3: S3Client, bucketName: string): Promise<EnsureResult> {
  let headWasAmbiguous403 = false
  const headResult = await s3
    .send(new HeadBucketCommand({ Bucket: bucketName }))
    .then(() => true)
    .catch((err: { $metadata?: { httpStatusCode?: number } }) => {
      const status = err.$metadata?.httpStatusCode
      // 403 is ambiguous on Scaleway (foreign-owned, missing perms, stale
      // reservation); fall through to CreateBucket for an authoritative answer.
      if (status === 403) {
        headWasAmbiguous403 = true
        return false
      }
      if (status === 404 || status === 301) return false
      throw err
    })

  if (headResult) return 'exists'

  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }))
    return 'created'
  } catch (err: unknown) {
    const name = (err as { name?: string }).name
    if (name === 'BucketAlreadyOwnedByYou') return 'exists'
    if (name === 'BucketAlreadyExists' && headWasAmbiguous403) return 'exists'
    if (name === 'BucketAlreadyExists') {
      throw new Error(
        `Bucket name "${bucketName}" is taken by another account — or by another PROJECT in this organization: ` +
          `Scaleway S3 follows the key's preferred project, so a bucket created with a differently-pointed key is unreachable from this one. ` +
          `Check the bucket's project in the console; otherwise pick a different slug in shared/config/config.default.ts.`,
      )
    }
    throw err
  }
}

/**
 * Post-condition: the bucket this key sees must live in the expected project.
 * Catches the pre-existing-bucket-in-the-wrong-project case that the preflight
 * (which only inspects the key) cannot: ListBuckets' Owner ID is the project
 * the key operates in, and the bucket must be in the returned listing.
 */
export async function assertBucketProject(s3: S3Client, bucketName: string, expectedProjectId: string): Promise<void> {
  const listing = await s3.send(new ListBucketsCommand({}))
  const ownerId = listing.Owner?.ID ?? ''
  if (!ownerId.startsWith(expectedProjectId)) {
    throw new Error(
      `State bucket owner project is '${ownerId}' but the app deploys to '${expectedProjectId}' — the key's preferred project points elsewhere. See the remedy in the preflight error above (IAM → API keys → preferred project).`,
    )
  }
  if (!listing.Buckets?.some((bucket) => bucket.Name === bucketName)) {
    throw new Error(
      `State bucket '${bucketName}' is not visible in project ${expectedProjectId} — it exists in another project of this organization (created with a key whose preferred project pointed elsewhere). Migrate the state or rename the bucket derivation (lib/stack/control-store.ts).`,
    )
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
  const { stateBucket } = await import('../lib/stack/control-store')
  const bucketName = stateBucket(appConfig.slug)
  const region = appConfig.s3.region

  // Preflight: refuse to create/touch the state bucket with a key pointed at
  // the wrong project (see keyProjectMismatch). Skipped when no expected
  // project id is in the environment (both the CLI and CI inject one).
  const expectedProjectId = resolveProjectId()
  if (expectedProjectId) {
    const keyProject = await keyPreferredProject({ secretKey }, accessKey)
    const mismatch = keyProjectMismatch(keyProject, expectedProjectId, accessKey)
    if (mismatch) {
      console.error(`✗ ${mismatch}`)
      process.exit(1)
    }
  } else {
    console.warn('⚠ SCW_PROJECT_ID / SCW_DEFAULT_PROJECT_ID not set — skipping the key-preferred-project preflight.')
  }

  const s3 = new S3Client({
    region,
    endpoint: `https://s3.${region}.scw.cloud`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  })
  const result = await ensureStateBucket(s3, bucketName)
  if (expectedProjectId) await assertBucketProject(s3, bucketName, expectedProjectId)
  if (result === 'exists') console.info(`Pulumi state bucket already exists: s3://${bucketName} (${region})`)
  else console.info(`Created Pulumi state bucket: s3://${bucketName} (${region})`)
}

if (isMain(import.meta.url)) await main()
