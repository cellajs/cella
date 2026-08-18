import * as pulumi from '@pulumi/pulumi';
import {
  type ControlState,
  controlKey,
  emptyControlState,
  readControlState,
  stateBucket,
} from '../lib/stack/control-store';
import { errorMessage } from '../lib/utils/errors';
import { mode, naming, region } from '../pulumi-context';

async function loadControlState(): Promise<ControlState> {
  if (process.env.VITEST) return emptyControlState();

  // AWS_* first: they are the state-backend S3 credentials, and Scaleway's S3 gateway honors only project-scoped ObjectStorage grants, which an API-capable SCW_* identity may lack.
  const accessKey = process.env.AWS_ACCESS_KEY_ID ?? process.env.SCW_ACCESS_KEY;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.SCW_SECRET_KEY;
  if (!accessKey || !secretKey) {
    pulumi.log.warn('control-store: no S3 credentials in env; rollout state defaults to first-provision values');
    return emptyControlState();
  }

  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region,
      endpoint: `https://s3.${region}.scw.cloud`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: false,
    });
    // One control object per deployment, keyed by the stack (= mode).
    const { state } = await readControlState(s3, stateBucket(naming.slug), controlKey(mode));
    return state;
  } catch (err) {
    // readControlState returns the empty state for a missing object, so only real failures reach here; the control object is the only source of rollout state, so fail closed.
    throw new Error(`control-store: failed to read rollout state, aborting deploy (${errorMessage(err)})`);
  }
}

export const controlState = await loadControlState();
