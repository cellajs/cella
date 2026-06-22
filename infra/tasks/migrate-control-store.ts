/**
 * One-time migration of the S3 control object from schemaVersion 1 (numeric
 * `gen` rollout) to schemaVersion 2 (the content-addressed deploy ledger).
 *
 * Why a migration is needed at all: the VM resource NAMING scheme changed from
 * `vm-<svc>-<gen>` (numeric) to `vm-<svc>-<genId>` (content hash). The first
 * `pulumi up` after this change therefore REPLACES every generation VM — the
 * old numeric-named resources can no longer be produced by the program, so they
 * are destroyed and the content-addressed ones are created. That is a one-time,
 * bounded downtime per service (backend rolls first), which is acceptable.
 *
 * What this task does: it carries each service's CURRENT live `sha` over as
 * `pendingSha` in the v2 ledger. That makes the Pulumi program materialise the
 * new content-addressed generation at the LIVE image (not the `latest`
 * placeholder a wiped control object would default to), and the rollout
 * reconciler then points the LB at it and promotes it to `active`.
 *
 * Idempotent and safe to re-run:
 *   - absent control object  → nothing to migrate (a fresh fork seeds on deploy)
 *   - already schemaVersion 2 → no-op
 *   - schemaVersion 1        → rewritten to v2 (with an If-Match guard)
 *
 * Usage (operator, locally, with SCW creds in env):
 *   pnpm --filter infra migrate-control-store --stack production [--dry-run]
 */
import { isMain } from '../lib/is-main'
import {
  type BootstrapState,
  type ControlState,
  controlActor,
  controlKey,
  type ServiceRollout,
  stateBucket,
} from '../lib/control-store'
import { getFlag } from './args'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type MigrationResult =
  | { action: 'absent' }
  | { action: 'already-v2' }
  | { action: 'migrated'; state: ControlState }

/**
 * Pure transform: given the raw control document text (or undefined when the
 * object does not exist), produce the migration outcome. Throws on an
 * unrecognised schema so a corrupt or future document fails loudly rather than
 * being silently overwritten.
 */
export function migrateControlDocument(raw: string | undefined): MigrationResult {
  if (raw === undefined || raw.trim() === '') return { action: 'absent' }

  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch (err) {
    throw new Error(`control: not valid JSON (${(err as Error).message})`)
  }
  if (!isRecord(doc)) throw new Error('control: root must be an object')
  if (doc.schemaVersion === 2) return { action: 'already-v2' }
  if (doc.schemaVersion !== 1) throw new Error(`control: cannot migrate schemaVersion ${String(doc.schemaVersion)} (expected 1)`)

  const bootstrap: BootstrapState = isRecord(doc.bootstrap) ? (doc.bootstrap as BootstrapState) : {}
  const rolloutV1 = isRecord(doc.rollout) ? doc.rollout : {}

  const rollout: Record<string, ServiceRollout> = {}
  for (const [slug, value] of Object.entries(rolloutV1)) {
    if (!isRecord(value)) continue
    // Carry the old numeric gen forward as the starting `seq` so the monotonic
    // counter never goes backwards relative to the run-number-based history.
    const seq = typeof value.gen === 'number' ? value.gen : 0
    const sha = typeof value.sha === 'string' ? value.sha : undefined
    const entry: ServiceRollout = { seq }
    // Only carry a real pinned SHA. A `latest` placeholder (pre-first-deploy
    // state) is dropped so the service falls back to first-provision behaviour.
    if (sha && sha !== 'latest') entry.pendingSha = sha
    rollout[slug] = entry
  }

  const state: ControlState = { schemaVersion: 2, bootstrap, rollout }
  return { action: 'migrated', state }
}

export async function migrateControlStore(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack')
  if (!stack) throw new Error('Usage: migrate-control-store.ts --stack <stack> [--dry-run]')
  const dryRun = argv.includes('--dry-run')

  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKey || !secretKey) throw new Error('migrate-control-store: SCW_ACCESS_KEY/SCW_SECRET_KEY (or AWS_*) required')

  process.env.APP_MODE ??= stack.split('/').pop()
  const { appConfig } = await import('shared')
  const { GetObjectCommand, PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3')
  const region = appConfig.s3.region
  const s3 = new S3Client({
    region,
    endpoint: `https://s3.${region}.scw.cloud`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  })
  const bucket = stateBucket(appConfig.slug)
  const key = controlKey(stack)

  // Raw read — deliberately NOT readControlState(), which now rejects v1.
  let raw: string | undefined
  let etag: string | undefined
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    raw = res.Body ? await res.Body.transformToString() : ''
    etag = res.ETag
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (!(e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404)) throw err
    raw = undefined
  }

  const result = migrateControlDocument(raw)
  if (result.action === 'absent') {
    console.info(`[migrate-control-store] no control object at s3://${bucket}/${key}; nothing to migrate`)
    return
  }
  if (result.action === 'already-v2') {
    console.info('[migrate-control-store] control object is already schemaVersion 2; nothing to do')
    return
  }

  const state = result.state
  state.updatedAt = new Date().toISOString()
  state.updatedBy = `${controlActor()} (migrate-v1-v2)`
  const body = `${JSON.stringify(state, null, 2)}\n`

  console.info('[migrate-control-store] proposed schemaVersion 2 document:')
  console.info(body)
  for (const [slug, entry] of Object.entries(state.rollout)) {
    console.info(`  ${slug}: seq=${entry.seq}${entry.pendingSha ? ` pendingSha=${entry.pendingSha}` : ' (no pending — first-provision)'}`)
  }

  if (dryRun) {
    console.info('[migrate-control-store] --dry-run: not writing')
    return
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      // Guard against a concurrent writer between our read and write.
      ...(etag ? { IfMatch: etag } : {}),
    }),
  )
  console.info(`[migrate-control-store] migrated s3://${bucket}/${key} to schemaVersion 2`)
}

if (isMain(import.meta.url)) {
  migrateControlStore().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
