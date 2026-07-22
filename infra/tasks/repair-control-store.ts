import { isMain } from '../lib/utils/is-main'
import {
  type BootstrapState,
  type ControlState,
  controlActor,
  controlContextForStack,
  type ServiceRollout,
} from '../lib/stack/control-store'
import { errorMessage } from '../lib/utils/errors'
import { isRecord } from '../lib/utils/guards'
import { getFlag } from './args'

/** A GenRef is valid only with a string id and sha plus a numeric seq. */
function validGenRef(value: unknown): { id: string; sha: string; seq: number } | undefined {
  if (!isRecord(value)) return undefined
  const { id, sha, seq } = value
  if (typeof id !== 'string' || id.length === 0) return undefined
  if (typeof sha !== 'string') return undefined
  if (typeof seq !== 'number') return undefined
  return { id, sha, seq }
}

export type RepairResult =
  | { action: 'absent' }
  | { action: 'healthy' }
  | { action: 'repaired'; state: ControlState }

/**
 * Repairs malformed control state by removing invalid active and obsolete previous pointers.
 * Unknown schema versions fail without overwriting potentially future data; absent input remains
 * absent.
 */
export function repairControlDocument(raw: string | undefined): RepairResult {
  if (raw === undefined || raw.trim() === '') return { action: 'absent' }

  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch (err) {
    throw new Error(`control: not valid JSON (${errorMessage(err)})`)
  }
  if (!isRecord(doc)) throw new Error('control: root must be an object')
  if (doc.schemaVersion !== 2) throw new Error(`control: cannot repair schemaVersion ${String(doc.schemaVersion)} (expected 2)`)

  const bootstrap: BootstrapState = isRecord(doc.bootstrap) ? (doc.bootstrap as BootstrapState) : {}
  const rolloutIn = isRecord(doc.rollout) ? doc.rollout : {}
  const rollout: Record<string, ServiceRollout> = {}
  let repaired = false
  for (const [slug, value] of Object.entries(rolloutIn)) {
    if (!isRecord(value)) continue
    const seq = typeof value.seq === 'number' ? value.seq : 0
    const entry: ServiceRollout = { seq }
    const active = validGenRef(value.active)
    if (value.active !== undefined && !active) repaired = true
    if (value.previous !== undefined) repaired = true // obsolete pointer, dropped
    if (active) entry.active = active
    if (typeof value.pendingSha === 'string') entry.pendingSha = value.pendingSha
    rollout[slug] = entry
  }
  if (!repaired) return { action: 'healthy' }
  return { action: 'repaired', state: { schemaVersion: 2, bootstrap, rollout } }
}

export async function repairControlStore(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack')
  if (!stack) throw new Error('Usage: repair-control-store.ts --stack <stack> [--dry-run]')
  const dryRun = argv.includes('--dry-run')

  const ctx = await controlContextForStack(stack)
  if (!ctx) throw new Error('repair-control-store: SCW_ACCESS_KEY/SCW_SECRET_KEY (or AWS_*) required')
  const { s3, bucket, controlKey: key } = ctx
  const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3')

  // Raw read, deliberately NOT readControlState(): the parser is exactly what a
  // corrupt document fails, so it cannot be the way in to fixing one.
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

  const result = repairControlDocument(raw)
  if (result.action === 'absent') {
    console.info(`[repair-control-store] no control object at s3://${bucket}/${key}; nothing to repair`)
    return
  }
  if (result.action === 'healthy') {
    console.info('[repair-control-store] control object is well-formed; nothing to do')
    return
  }

  const state = result.state
  state.updatedAt = new Date().toISOString()
  state.updatedBy = `${controlActor()} (repair)`
  const body = `${JSON.stringify(state, null, 2)}\n`

  console.info('[repair-control-store] proposed document:')
  console.info(body)
  for (const [slug, entry] of Object.entries(state.rollout)) {
    console.info(`  ${slug}: seq=${entry.seq}${entry.pendingSha ? ` pendingSha=${entry.pendingSha}` : ''}${entry.active ? ` active=${entry.active.id}` : ' (no active)'}`)
  }

  if (dryRun) {
    console.info('[repair-control-store] --dry-run: not writing')
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
  console.info(`[repair-control-store] repaired s3://${bucket}/${key}`)
}

if (isMain(import.meta.url)) {
  repairControlStore().catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
