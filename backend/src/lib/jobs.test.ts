import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { declaredQueues, validateJobDeclarations } from '#/lib/jobs';
import { type BackendJob, type BackendQueue, getBackendJobs } from '#/lib/module';
import '#/modules'; // composition root: the declarations under test

// An unstarted instance evaluates cron expressions without a database.
const preview = (cron: string) => new PgBoss('postgres://localhost/unused').previewSchedule(cron, { count: 2 });

const job = (name: string, cron = '0 * * * *'): BackendJob => ({ name, cron, run: async () => {} });
const queue = (name: string, options: Partial<BackendQueue> = {}): BackendQueue => ({ name, ...options });

describe('job declarations', () => {
  it('registers the template sweeps as cron jobs on singleton queues', () => {
    const names = getBackendJobs().map((declared) => declared.name);
    expect(names).toEqual(
      expect.arrayContaining(['notification-digest', 'oidc-payloads-sweep', 'prune-devices', 'reap-unproven-accounts']),
    );
    for (const declared of declaredQueues().filter((entry) => names.includes(entry.name))) {
      expect(declared.options.policy).toBe('singleton');
      expect(declared.options.retryLimit).toBe(0);
    }
  });

  it('accepts every registered job and queue', () => {
    expect(() => validateJobDeclarations(preview)).not.toThrow();
  });

  it('rejects a cron expression the scheduler cannot evaluate', () => {
    expect(() => validateJobDeclarations(preview, { jobs: [job('bad', 'every hour')], queues: [] })).toThrow(
      /invalid cron/,
    );
  });

  it('rejects a name shared by a queue and a job', () => {
    expect(() => validateJobDeclarations(preview, { jobs: [job('same')], queues: [queue('same')] })).toThrow(
      /declared twice/,
    );
  });

  it('rejects a dead-letter target that is not declared', () => {
    expect(() =>
      validateJobDeclarations(preview, { jobs: [], queues: [queue('deliver', { deadLetter: 'deliver.dead' })] }),
    ).toThrow(/not declared/);
    expect(() =>
      validateJobDeclarations(preview, {
        jobs: [],
        queues: [queue('deliver', { deadLetter: 'deliver.dead' }), queue('deliver.dead')],
      }),
    ).not.toThrow();
  });
});
