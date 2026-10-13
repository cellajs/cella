import { controlKey, readObjectEtag, type S3Like } from './control-store';
import { checkpointKey } from './pending-operations';

/**
 * What a plan was computed from, as the state bucket holds it: the etag of the Pulumi checkpoint and of the control object, null for an
 * object that does not exist. A `pulumi preview` writes neither (checked on Pulumi 3.265), and every `up`, deploy or rollout write changes one.
 */
export interface PlanBasis {
  checkpoint: string | null;
  control: string | null;
}

/** Read the basis of a plan for `stack`. A read failure throws: an unread object never passes for an unchanged one. */
export async function readPlanBasis(s3: S3Like, bucket: string, stack: string): Promise<PlanBasis> {
  const [checkpoint, control] = await Promise.all([readObjectEtag(s3, bucket, checkpointKey(stack)), readObjectEtag(s3, bucket, controlKey(stack))]);
  return { checkpoint, control };
}

/** What changed in the state bucket since a plan was made, one clause per object. Empty when the plan still describes what an `up` would do. */
export function planBasisChanges(reviewed: PlanBasis, current: PlanBasis): string[] {
  return [
    ...(reviewed.checkpoint === current.checkpoint ? [] : ['the Pulumi state changed']),
    ...(reviewed.control === current.control ? [] : ['the rollout pointers changed']),
  ];
}
