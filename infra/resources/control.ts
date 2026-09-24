import * as pulumi from '@pulumi/pulumi';
import { makeS3Client } from '../lib/scaleway/s3-client';
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

  // AWS_* first: it is the state-backend S3 key, and Scaleway's S3 gateway honors only project-scoped ObjectStorage grants, which an API-capable SCW_* identity may lack.
  const accessKey = process.env.AWS_ACCESS_KEY_ID ?? process.env.SCW_ACCESS_KEY;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.SCW_SECRET_KEY;
  if (!accessKey || !secretKey) {
    pulumi.log.warn('control-store: no S3 key in env; rollout state defaults to first-provision values');
    return emptyControlState();
  }

  try {
    const s3 = await makeS3Client(region, accessKey, secretKey);
    // One control object per deployment, keyed by the stack (= mode).
    const { state } = await readControlState(s3, stateBucket(naming.slug), controlKey(mode));
    return state;
  } catch (err) {
    // readControlState returns the empty state for a missing object, so only real failures reach here; the control object is the only source of rollout state, so fail closed.
    throw new Error(`control-store: failed to read rollout state, aborting deploy (${errorMessage(err)})`);
  }
}

export const controlState = await loadControlState();
