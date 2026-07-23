import * as pulumi from '@pulumi/pulumi'
import { type ControlState, controlKey, emptyControlState, readControlState, stateBucket } from '../lib/stack/control-store'
import { foundationStackName, naming, region } from '../pulumi-context'
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
    // One control object per deployment, keyed by the FOUNDATION stack: a
    // `<mode>-gen-<slug>` stack shares its foundation's rollout state.
    const { state } = await readControlState(s3, stateBucket(naming.slug), controlKey(foundationStackName))
    return state
  } catch (err) {
    // readControlState returns the empty state for a missing object (fresh stack);
    // only genuine failures reach here. The control object is the sole source of
    // rollout state, so fail closed to protect live compute.
    throw new Error(`control-store: failed to read rollout state — aborting deploy (${errorMessage(err)})`)
  }
}

export const controlState = await loadControlState()
