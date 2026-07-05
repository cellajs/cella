/**
 * Program-side loader for the stack control object (rollout + bootstrap state).
 *
 * Read ONCE at plan time so `compute.ts` can resolve each service's live
 * generation + SHA from the single source of truth (the S3 control object)
 * rather than committed `Pulumi.<stack>.yaml` config. A bare `pulumi up` then
 * converges to what is actually live.
 *
 * Safe-by-omission: if there are no S3 credentials in the environment, or the
 * object does not exist yet (fresh stack), we return the empty state and callers
 * default to first-provision values. But a genuine read FAILURE (network, bad
 * creds) fails closed — the control object is the sole source of rollout state,
 * so aborting beats silently regressing live compute to gen 1 / latest. The S3
 * read is also skipped under Vitest so unit tests never reach the network.
 */
import * as pulumi from '@pulumi/pulumi'
import { type ControlState, controlKey, emptyControlState, readControlState, stateBucket } from '../lib/stack/control-store'
import { naming, region } from '../pulumi-context'
import { errorMessage } from '../lib/utils/errors'

async function loadControlState(): Promise<ControlState> {
  if (process.env.VITEST) return emptyControlState()

  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKey || !secretKey) {
    pulumi.log.warn('control-store: no S3 credentials in env; rollout state defaults to first-provision values')
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
    // readControlState returns the empty state for a missing object (fresh stack);
    // only genuine failures reach here. The control object is the sole source of
    // rollout state, so fail closed rather than regress live compute.
    throw new Error(`control-store: failed to read rollout state — aborting deploy (${errorMessage(err)})`)
  }
}

export const controlState = await loadControlState()
