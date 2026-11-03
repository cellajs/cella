import { readObjectEtag, type S3Like } from './control-store';
import { checkpointKey } from './pending-operations';

/**
 * What a plan was computed from, as the state bucket holds it: the etag of the Pulumi checkpoint, null when it does not exist. A
 * `pulumi preview` writes none (checked on Pulumi 3.265), and every `up` changes it; a deploy writes no state.
 */
export interface PlanBasis {
  checkpoint: string | null;
}

/** Read the basis of a plan for `stack`. A read failure throws: an unread object never passes for an unchanged one. */
export async function readPlanBasis(s3: S3Like, bucket: string, stack: string): Promise<PlanBasis> {
  return { checkpoint: await readObjectEtag(s3, bucket, checkpointKey(stack)) };
}

/** What changed in the state bucket since a plan was made. Empty when the plan still describes what an `up` would do. */
export function planBasisChanges(reviewed: PlanBasis, current: PlanBasis): string[] {
  return reviewed.checkpoint === current.checkpoint ? [] : ['the Pulumi state changed'];
}
