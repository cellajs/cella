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
const CONTROL = 'control/production.json';

describe('readPlanBasis', () => {
  it('reads the etags of the checkpoint and the control object of the stack, without their bodies', async () => {
    const { s3, heads } = bucket({ [CHECKPOINT]: '"aaa"', [CONTROL]: '"bbb"' });
    expect(await readPlanBasis(s3, 'state', 'organization/infra/production')).toEqual({ checkpoint: '"aaa"', control: '"bbb"' });
    expect(heads.sort()).toEqual([CHECKPOINT, CONTROL]);
  });

  it('records an object that does not exist as null', async () => {
    const { s3 } = bucket({ [CHECKPOINT]: '"aaa"' });
    expect(await readPlanBasis(s3, 'state', 'organization/infra/production')).toEqual({ checkpoint: '"aaa"', control: null });
  });

  it('must not let an unreadable object pass for an unchanged one: a read failure throws', async () => {
    const { s3 } = bucket({ [CHECKPOINT]: '"aaa"', [CONTROL]: Object.assign(new Error('access denied'), { name: 'AccessDenied' }) });
    await expect(readPlanBasis(s3, 'state', 'organization/infra/production')).rejects.toThrow('access denied');
  });
});

describe('planBasisChanges', () => {
  const reviewed = { checkpoint: '"aaa"', control: '"bbb"' };

  it('is empty while both objects are the ones the plan was made on', () => {
    expect(planBasisChanges(reviewed, { ...reviewed })).toEqual([]);
    expect(planBasisChanges({ checkpoint: '"aaa"', control: null }, { checkpoint: '"aaa"', control: null })).toEqual([]);
  });

  it('names the Pulumi state when a deploy or another up wrote the checkpoint', () => {
    expect(planBasisChanges(reviewed, { ...reviewed, checkpoint: '"ccc"' })).toEqual(['the Pulumi state changed']);
  });

  it('names the rollout pointers when the control object changed, also when it appeared or went away', () => {
    expect(planBasisChanges(reviewed, { ...reviewed, control: '"ddd"' })).toEqual(['the rollout pointers changed']);
    expect(planBasisChanges({ ...reviewed, control: null }, reviewed)).toEqual(['the rollout pointers changed']);
    expect(planBasisChanges(reviewed, { ...reviewed, control: null })).toEqual(['the rollout pointers changed']);
  });

  it('names both when both changed', () => {
    expect(planBasisChanges(reviewed, { checkpoint: '"x"', control: '"y"' })).toEqual(['the Pulumi state changed', 'the rollout pointers changed']);
  });
});
