import { vi } from 'vitest';
import type { LockInfo, S3Like } from '../../lib/stack/control-store';

/** Stateful single-object S3 fake honouring If-None-Match / If-Match, the conditional writes the stack lock and control object rely on. */
export function makeLockS3(initial?: LockInfo) {
  let obj: { body: string; etag: string } | undefined = initial
    ? { body: JSON.stringify(initial), etag: '"e1"' }
    : undefined;
  let counter = 1;
  const fail412 = () => Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' });
  const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, string> }) => {
    const kind = cmd.constructor.name;
    const input = cmd.input;
    if (kind === 'GetObjectCommand') {
      if (!obj) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => obj!.body }, ETag: obj.etag };
    }
    if (kind === 'PutObjectCommand') {
      if (input.IfNoneMatch === '*' && obj) throw fail412();
      if (input.IfMatch && (!obj || obj.etag !== input.IfMatch)) throw fail412();
      obj = { body: input.Body ?? '', etag: `"e${++counter}"` };
      return { ETag: obj.etag };
    }
    if (kind === 'DeleteObjectCommand') {
      obj = undefined;
      return {};
    }
    throw new Error(`unexpected command ${kind}`);
  });
  return {
    s3: { send } as unknown as S3Like,
    /** The stored object as the bucket holds it. */
    current: () => obj,
    /** The stored lock, parsed. */
    currentInfo: () => (obj ? (JSON.parse(obj.body) as LockInfo) : undefined),
    /** Replace the object behind the holder's back, as another writer would. */
    overwrite: (info: LockInfo) => {
      obj = { body: JSON.stringify(info), etag: `"e${++counter}"` };
    },
  };
}
