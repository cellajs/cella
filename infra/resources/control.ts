/**
 * Program-side loader for the stack control object (rollout + bootstrap state).
 *
 * Read ONCE at plan time so `compute.ts` can resolve each service's live
 * generation + SHA from the single source of truth (the S3 control object)
 * rather than committed `Pulumi.<stack>.yaml` config. A bare `pulumi up` then
 * converges to what is actually live.
 *
 * Safe-by-omission: if there are no S3 credentials in the environment, or the
 * object does not exist yet (mid-migration), or the read fails, we return the
 * empty state and callers fall back to Pulumi config — preserving today's
 * behaviour. The S3 read is also skipped under Vitest so unit tests never reach
 * the network regardless of ambient credentials.
 */
import * as pulumi from '@pulumi/pulumi'
import { type ControlState, controlKey, emptyControlState, readControlState, stateBucket } from '../lib/control-store'
import { naming, region } from '../pulumi-context'

async function loadControlState(): Promise<ControlState> {
  if (process.env.VITEST) return emptyControlState()

  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKey || !secretKey) {
    pulumi.log.warn('control-store: no S3 credentials in env; falling back to Pulumi config for rollout state')
    return emptyControlState()
  }

  try {
    const { S3Client } = await import('@aws-sdk/client-s3')
    const s3 = new S3Client({
      region,
      endpoint: `https://s3.${region}.scw.cloud`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: false,
    })
    const { state } = await readControlState(s3, stateBucket(naming.slug), controlKey(pulumi.getStack()))
    return state
  } catch (err) {
    // A genuine read error (bad creds, network) must not crash the program nor
    // silently misdeploy: warn loudly and fall back to config for this run.
    pulumi.log.warn(`control-store: read failed (${(err as Error).message}); falling back to Pulumi config for rollout state`)
    return emptyControlState()
  }
}

export const controlState = await loadControlState()
