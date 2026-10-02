import { describe, expect, it } from 'vitest';
import {
  checkpointKey,
  clearPendingCreates,
  type PendingClearEffects,
  type PendingOperation,
  pendingOperationsOf,
  planPendingClear,
  readPendingOperations,
  withoutPendingCreates,
} from './pending-operations';

const policyUrn = 'urn:pulumi:production::infra::scaleway:iam/policy:Policy::vm-backend-policy';
const stackUrn = 'urn:pulumi:production::infra::pulumi:pulumi:Stack::infra-production';
const vmUrn = 'urn:pulumi:production::infra::scaleway:instance/server:Server::vm-backend-ba1d';

const pendingCreate = { resource: { urn: policyUrn, custom: true, type: 'scaleway:iam/policy:Policy' }, type: 'creating' };
const pendingUpdate = { resource: { urn: vmUrn, custom: true, type: 'scaleway:instance/server:Server' }, type: 'updating' };

/** The deployment both file shapes carry, as Pulumi 3.265 writes it (shape captured from a local file backend). */
function deployment(pending: unknown[]) {
  return {
    manifest: { time: '2026-10-02T12:00:30Z', magic: 'm', version: 'v3.265.0' },
    secrets_providers: { type: 'passphrase', state: { salt: 'v1:salt' } },
    resources: [
      { urn: stackUrn, custom: false, type: 'pulumi:pulumi:Stack' },
      { urn: policyUrn, custom: true, id: 'policy-1', type: 'scaleway:iam/policy:Policy' },
    ],
    ...(pending.length > 0 ? { pending_operations: pending } : {}),
    metadata: {},
  };
}

/** The checkpoint object the S3 backend stores at `.pulumi/stacks/<project>/<stack>.json`. */
const checkpoint = (pending: unknown[]) => ({ version: 3, checkpoint: { stack: 'organization/infra/production', latest: deployment(pending) } });
/** `pulumi stack export` output. */
const exported = (pending: unknown[]) => ({ version: 3, deployment: deployment(pending) });

describe('checkpointKey', () => {
  it('addresses the project-scoped layout of the S3 backend', () => {
    expect(checkpointKey('organization/infra/production')).toBe('.pulumi/stacks/infra/production.json');
    expect(checkpointKey('staging')).toBe('.pulumi/stacks/infra/staging.json');
  });
});

describe('pendingOperationsOf', () => {
  it('reads the pending operations of a checkpoint and of an export alike', () => {
    const expected: PendingOperation[] = [{ urn: policyUrn, type: 'scaleway:iam/policy:Policy', kind: 'creating', inState: true }];
    expect(pendingOperationsOf(checkpoint([pendingCreate]))).toEqual(expected);
    expect(pendingOperationsOf(exported([pendingCreate]))).toEqual(expected);
  });

  it('tells a create the state recorded from one whose resource it never recorded', () => {
    const orphan = { resource: { urn: `${policyUrn}-2`, type: 'scaleway:iam/policy:Policy' }, type: 'creating' };
    expect(pendingOperationsOf(checkpoint([pendingCreate, orphan])).map((operation) => operation.inState)).toEqual([true, false]);
  });

  it('is empty for a clean state and for a stack that never completed an update', () => {
    expect(pendingOperationsOf(checkpoint([]))).toEqual([]);
    expect(pendingOperationsOf({ version: 3, checkpoint: { stack: 'organization/infra/production' } })).toEqual([]);
  });

  it('refuses a document that is no checkpoint, so a misread never passes for a clean state', () => {
    expect(() => pendingOperationsOf({ rollout: {} })).toThrow(/not a Pulumi checkpoint/);
  });
});

describe('readPendingOperations', () => {
  const s3 = (body?: string) => ({
    send: async (command: unknown) => {
      const input = (command as { input: { Key: string } }).input;
      expect(input.Key).toBe('.pulumi/stacks/infra/production.json');
      if (body === undefined) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => body } };
    },
  });

  it('reads the checkpoint object from the state bucket', async () => {
    expect(
      await readPendingOperations(s3(JSON.stringify(checkpoint([pendingCreate]))), 'cella-pulumi-state', 'organization/infra/production'),
    ).toHaveLength(1);
  });

  it('reports a missing checkpoint as unread, never as a clean state', async () => {
    expect(await readPendingOperations(s3(), 'cella-pulumi-state', 'production')).toBeUndefined();
  });
});

describe('planPendingClear', () => {
  const op = (kind: string): PendingOperation => ({ urn: `urn:${kind}`, type: 't', kind, inState: true });

  it('clears pending creates when nothing else is pending', () => {
    expect(planPendingClear([op('creating')])).toMatchObject({ clearable: true, others: [] });
  });

  it('clears nothing while an interrupted update or delete is pending: the import would drop it unread', () => {
    const plan = planPendingClear([op('creating'), op('updating'), op('deleting')]);
    expect(plan.clearable).toBe(false);
    expect(plan.others.map((operation) => operation.kind)).toEqual(['updating', 'deleting']);
  });

  it('has nothing to clear without a pending create', () => {
    expect(planPendingClear([]).clearable).toBe(false);
  });
});

describe('withoutPendingCreates', () => {
  it('removes the creates and keeps every other field as exported', () => {
    const before = exported([pendingCreate]);
    const snapshot = structuredClone(before);
    const after = withoutPendingCreates(before) as ReturnType<typeof exported>;
    expect(after).toEqual(exported([]));
    expect(after.deployment).not.toHaveProperty('pending_operations');
    expect(before).toEqual(snapshot);
  });

  it('keeps a non-create entry', () => {
    expect(withoutPendingCreates(exported([pendingCreate, pendingUpdate]))).toEqual(exported([pendingUpdate]));
  });
});

describe('clearPendingCreates', () => {
  const reviewed = pendingOperationsOf(exported([pendingCreate]));

  function effects(opts: { exportedPending?: unknown[]; after?: PendingOperation[] } = {}) {
    const steps: string[] = [];
    const imported: unknown[] = [];
    const fx: PendingClearEffects = {
      exportState: () => {
        steps.push('export');
        return JSON.stringify(exported(opts.exportedPending ?? [pendingCreate]));
      },
      saveBackup: () => {
        steps.push('backup');
        return '/infra/.state-backups/production.json';
      },
      importState: (document) => {
        steps.push('import');
        imported.push(document);
      },
      readPending: async () => {
        steps.push('verify');
        return opts.after ?? [];
      },
    };
    return { fx, steps, imported };
  }

  it('saves the export before importing it without the creates, then confirms they are gone', async () => {
    const { fx, steps, imported } = effects();
    await expect(clearPendingCreates(reviewed, fx)).resolves.toEqual({ backupPath: '/infra/.state-backups/production.json' });
    expect(steps).toEqual(['export', 'backup', 'import', 'verify']);
    expect(imported).toEqual([exported([])]);
  });

  it('imports nothing when the state changed since the operator reviewed it', async () => {
    const { fx, steps } = effects({ exportedPending: [pendingCreate, { ...pendingCreate, resource: { ...pendingCreate.resource, urn: vmUrn } }] });
    await expect(clearPendingCreates(reviewed, fx)).rejects.toThrow(/changed since they were listed/);
    expect(steps).toEqual(['export']);
  });

  it('imports nothing while a non-create operation is pending', async () => {
    const both = [pendingCreate, pendingUpdate];
    const { fx, steps } = effects({ exportedPending: both });
    await expect(clearPendingCreates(pendingOperationsOf(exported(both)), fx)).rejects.toThrow(/only pending creates/);
    expect(steps).toEqual(['export']);
  });

  it('fails when a create is still pending after the import, naming the backup', async () => {
    const { fx } = effects({ after: reviewed });
    await expect(clearPendingCreates(reviewed, fx)).rejects.toThrow(/left 1 pending create.*state-backups/);
  });
});
