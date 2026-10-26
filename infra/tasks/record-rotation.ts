import {
  type ControlState,
  controlKey,
  type Rotations,
  readControlState,
  type S3Like,
  withRotation,
  writeControlState,
} from '../lib/stack/control-store';

/**
 * Record a rotation in the stack's control object and raise the counter that every new generation's identity carries. The caller holds the
 * stack lock; the write is conditional on the object it read, so a write that raced it fails loudly and nothing is lost.
 */
export async function recordRotation(opts: {
  s3: S3Like;
  bucket: string;
  stack: string;
  kind: 'keys' | 'secrets';
  by: string;
  now?: Date;
}): Promise<Rotations> {
  const key = controlKey(opts.stack);
  const { state, etag } = await readControlState(opts.s3, opts.bucket, key);
  const at = (opts.now ?? new Date()).toISOString();
  const next: ControlState = { ...withRotation(state, opts.kind, { at, by: opts.by }), updatedAt: at, updatedBy: opts.by };
  await writeControlState(opts.s3, opts.bucket, key, next, etag ? { ifMatch: etag } : { ifNoneMatch: '*' });
  return next.rotations as Rotations;
}
