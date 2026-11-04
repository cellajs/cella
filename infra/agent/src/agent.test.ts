import { describe, expect, it } from 'vitest';
import { type AgentEffects, runAgent } from './agent';
import { healthAnswer } from './health';
import type { Manifest } from './manifest';

const release = 'c'.repeat(40);
const up = { status: 204, version: release };

describe("the agent's answer to the load balancer", () => {
  it('is 200 only while the release booted, the machine is not draining, and the service serves this release', () => {
    expect(healthAnswer({ booted: true, draining: false }, up, release)).toBe(200);
    expect(healthAnswer({ booted: true, draining: false }, { status: 200, version: release }, release)).toBe(200);
    // Not booted yet, or a boot that failed: the new machine takes no traffic.
    expect(healthAnswer({ booted: false, draining: false }, up, release)).toBe(503);
    // Draining: the old machine leaves the pool while the service still answers.
    expect(healthAnswer({ booted: true, draining: true }, up, release)).toBe(503);
    // Another release on the port, a failing service, or none at all.
    expect(healthAnswer({ booted: true, draining: false }, { status: 204, version: 'o'.repeat(40) }, release)).toBe(503);
    expect(healthAnswer({ booted: true, draining: false }, { status: 503, version: release }, release)).toBe(503);
    expect(healthAnswer({ booted: true, draining: false }, { status: 0 }, release)).toBe(503);
  });
});

function fake(manifests: Array<Manifest | Error>, opts: { bootFails?: boolean } = {}) {
  const ops: string[] = [];
  let read = 0;
  let state: (() => { booted: boolean; draining: boolean }) | undefined;
  const fx: AgentEffects = {
    boot: async () => {
      ops.push('boot');
      if (opts.bootFails) throw new Error('compose up failed');
    },
    readManifest: async () => {
      const next = manifests[Math.min(read++, manifests.length - 1)];
      if (!next || next instanceof Error) throw next ?? new Error('none');
      return next;
    },
    stopServices: async () => {
      ops.push('stop');
    },
    serve: (current) => {
      state = current;
      ops.push('serve');
    },
    sleep: async (ms) => {
      ops.push(`sleep ${ms}`);
    },
    log: () => {},
  };
  return { fx, ops, state: () => state?.() };
}

const manifest = (drain: boolean): Manifest => ({ role: 'backend', release, drain });

describe("the agent's life", () => {
  it('answers before it boots, and on a drain order answers 503, keeps connections for the drain seconds, then stops the containers', async () => {
    const { fx, ops, state } = fake([manifest(false), manifest(false), new Error('metadata busy'), manifest(true)]);
    const end = await runAgent(fx, { drainSeconds: 10, pollMs: 2_000 });
    expect(ops).toEqual(['serve', 'boot', 'sleep 2000', 'sleep 2000', 'sleep 2000', 'sleep 10000', 'stop']);
    expect(end).toEqual({ booted: true, draining: true });
    expect(state()).toEqual({ booted: true, draining: true });
  });

  it('starts nothing on a machine whose manifest already says drain, as after a reboot of a drained machine', async () => {
    const { fx, ops } = fake([manifest(true)]);
    expect(await runAgent(fx, { drainSeconds: 5 })).toEqual({ booted: false, draining: true });
    expect(ops).toEqual(['serve', 'sleep 5000', 'stop']);
  });

  it('keeps answering 503 after a failed boot, until the deploy deletes the machine', async () => {
    const { fx } = fake([manifest(false)], { bootFails: true });
    expect(await runAgent(fx, { drainSeconds: 0, rounds: 3 })).toEqual({ booted: false, draining: false });
  });
});
