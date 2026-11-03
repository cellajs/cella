import { describe, expect, it } from 'vitest';
import type { S3Like } from './control-store';
import { planBasisChanges, readPlanBasis } from './plan-basis';

/** An S3 client that answers HEAD from a key → etag map; a key mapped to an Error throws it, and a missing key is a 404. */
function bucket(objects: Record<string, string | Error>): { s3: S3Like; heads: string[] } {
  const heads: string[] = [];
  const s3: S3Like = {
    send: async (command) => {
      const head = command as { constructor: { name: string }; input: { Key: string } };
      if (head.constructor.name !== 'HeadObjectCommand') throw new Error(`unexpected ${head.constructor.name}`);
      heads.push(head.input.Key);
      const found = objects[head.input.Key];
      if (found instanceof Error) throw found;
      if (found === undefined) throw Object.assign(new Error('not found'), { name: 'NotFound' });
      return { ETag: found };
    },
  };
  return { s3, heads };
}

const CHECKPOINT = '.pulumi/stacks/infra/production.json';

describe('readPlanBasis', () => {
  it('reads the etag of the checkpoint of the stack, without its body', async () => {
    const { s3, heads } = bucket({ [CHECKPOINT]: '"aaa"' });
    expect(await readPlanBasis(s3, 'state', 'organization/infra/production')).toEqual({ checkpoint: '"aaa"' });
    expect(heads).toEqual([CHECKPOINT]);
  });

  it('records a checkpoint that does not exist as null', async () => {
    const { s3 } = bucket({});
    expect(await readPlanBasis(s3, 'state', 'organization/infra/production')).toEqual({ checkpoint: null });
  });

  it('must not let an unreadable checkpoint pass for an unchanged one: a read failure throws', async () => {
    const { s3 } = bucket({ [CHECKPOINT]: Object.assign(new Error('access denied'), { name: 'AccessDenied' }) });
    await expect(readPlanBasis(s3, 'state', 'organization/infra/production')).rejects.toThrow('access denied');
  });
});

describe('planBasisChanges', () => {
  it('is empty while the checkpoint is the one the plan was made on, and names the state when another up wrote it', () => {
    expect(planBasisChanges({ checkpoint: '"aaa"' }, { checkpoint: '"aaa"' })).toEqual([]);
    expect(planBasisChanges({ checkpoint: null }, { checkpoint: null })).toEqual([]);
    expect(planBasisChanges({ checkpoint: '"aaa"' }, { checkpoint: '"ccc"' })).toEqual(['the Pulumi state changed']);
  });
});
