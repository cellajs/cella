import { describe, expect, it } from 'vitest';
import type { LiveRole } from '../lib/deploy/live-record';
import type { MachineRole } from '../lib/machine-roles';
import { servicesByName } from '../lib/services';
import { type RoleMachine, type SwitchEffects, type SwitchResult, switchMachines, switchRole } from './switch-machines';

const target = { commit: 'c'.repeat(40), retry: 0, rotation: 0 };
const live = (over: Partial<LiveRole> = {}): LiveRole => ({ slot: 'a', machine: 'old', commit: 'o'.repeat(40), retry: 0, rotation: 0, ...over });

function roleOf(slug: 'backend' | 'cdc' | 'frontend', over: Partial<MachineRole> = {}): MachineRole {
  const service = servicesByName.get(slug);
  if (!service) throw new Error(slug);
  const routed = slug !== 'cdc';
  return {
    role: slug,
    services: [service],
    pools: routed ? [{ key: slug, service: slug, port: service.healthPort }] : [],
    strategy: service.replacementStrategy,
    drainSeconds: 10,
    primary: slug === 'backend',
    ...over,
  };
}

/** Stand-in effects that record every op; `serves` decides what a new machine's wait ends in. */
function fake(opts: { machines?: Record<string, RoleMachine[]>; serves?: 'serving' | 'failed' | 'timeout'; drainFails?: boolean } = {}) {
  const ops: string[] = [];
  const recorded: Array<[string, LiveRole | undefined]> = [];
  let made = 0;
  let writing = 0;
  let concurrent = 0;
  const fx: SwitchEffects = {
    machinesOf: async (role) => opts.machines?.[role] ?? [],
    boot: async (role, slot) => {
      const id = `new-${role.role}-${slot}-${++made}`;
      ops.push(`boot ${role.role} ${slot}`);
      return id;
    },
    serving: async (role, slot) => {
      ops.push(`serving? ${role.role} ${slot}`);
      return opts.serves ?? 'serving';
    },
    drain: async (_role, machine) => {
      ops.push(`drain ${machine}`);
      if (opts.drainFails) throw new Error('user data refused');
    },
    out: async (role, slot) => {
      ops.push(`out? ${role.role} ${slot}`);
      return true;
    },
    remove: async (machine) => {
      ops.push(`remove ${machine}`);
    },
    record: async (role, entry) => {
      writing += 1;
      concurrent = Math.max(concurrent, writing);
      await new Promise((done) => setTimeout(done, 1));
      writing -= 1;
      ops.push(`record ${role} ${entry ? entry.slot : 'none'}`);
      recorded.push([role, entry]);
    },
    sleep: async () => {},
    log: () => {},
  };
  return { fx, ops, recorded, concurrent: () => concurrent };
}

describe('a switch', () => {
  it('boots the new machine on the idle slot, records it once it serves, then drains and deletes the old one', async () => {
    const { fx, ops, recorded } = fake({ machines: { backend: [{ id: 'old', slot: 'a' }] } });
    const result = await switchRole({ role: roleOf('backend'), live: live(), target }, fx);
    expect(result).toEqual({ role: 'backend', slot: 'b', machine: 'new-backend-b-1' });
    expect(ops).toEqual(['boot backend b', 'serving? backend b', 'record backend b', 'drain old', 'out? backend a', 'remove old']);
    expect(recorded[0]?.[1]).toEqual({ slot: 'b', machine: 'new-backend-b-1', ...target });
  });

  it('must not take traffic from the old machine when the new one never serves: it deletes the new one and records nothing', async () => {
    for (const serves of ['timeout', 'failed'] as const) {
      const { fx, ops, recorded } = fake({ machines: { backend: [{ id: 'old', slot: 'a' }] }, serves });
      await expect(switchRole({ role: roleOf('backend'), live: live(), target }, fx)).rejects.toThrow(/slot a keeps serving/);
      expect(ops).toEqual(['boot backend b', 'serving? backend b', 'remove new-backend-b-1']);
      expect(recorded).toEqual([]);
      expect(ops).not.toContain('drain old');
    }
  });

  it('keeps the new machine after the switch: a drain of the old one that fails leaves the new one recorded', async () => {
    const { fx, ops, recorded } = fake({ drainFails: true });
    await expect(switchRole({ role: roleOf('backend'), live: live(), target }, fx)).rejects.toThrow(/user data refused/);
    expect(recorded.map(([, entry]) => entry?.machine)).toEqual(['new-backend-b-1']);
    expect(ops).not.toContain('remove new-backend-b-1');
  });

  it('drains and deletes a stop-first role first (one replication slot), and keeps the new one for its account when it fails', async () => {
    const { fx, ops } = fake({ serves: 'failed' });
    await expect(switchRole({ role: roleOf('cdc'), live: live(), target }, fx)).rejects.toThrow(/stays for its boot account/);
    expect(ops).toEqual(['drain old', 'remove old', 'record cdc none', 'boot cdc b', 'serving? cdc b']);
  });

  it("deletes a machine on the idle slot that a dead run left, before it boots there: the slot's address is free again", async () => {
    const { fx, ops } = fake({
      machines: {
        frontend: [
          { id: 'old', slot: 'a' },
          { id: 'stray', slot: 'b' },
        ],
      },
    });
    await switchRole({ role: roleOf('frontend'), live: live(), target }, fx);
    expect(ops.slice(0, 4)).toEqual(['drain stray', 'out? frontend b', 'remove stray', 'boot frontend b']);
  });

  it('boots a first deploy on slot a and drains nothing', async () => {
    const { fx, ops } = fake();
    await switchRole({ role: roleOf('frontend'), target }, fx);
    expect(ops).toEqual(['boot frontend a', 'serving? frontend a', 'record frontend a']);
  });
});

describe('every switch of a deploy', () => {
  it('switches the primary alone first, then the rest, and retires the machine of a role the registry dropped', async () => {
    const { fx, ops } = fake();
    const switched: SwitchResult[] = [];
    await switchMachines(
      {
        roles: [roleOf('backend'), roleOf('frontend')],
        pending: ['backend', 'frontend'],
        record: { schemaVersion: 1, roles: { backend: live({ machine: 'b0' }), frontend: live({ machine: 'f0' }), yjs: live({ machine: 'y0' }) } },
        target,
        switched,
      },
      fx,
    );
    expect(ops.indexOf('remove b0')).toBeLessThan(ops.indexOf('boot frontend b'));
    expect(ops.slice(-3)).toEqual(['drain y0', 'remove y0', 'record yjs none']);
    expect(switched).toHaveLength(2);
  });

  it('writes the live record one role at a time, so no role loses a conflict after its machine serves', async () => {
    const { fx, concurrent } = fake();
    const roles = [
      roleOf('backend'),
      roleOf('frontend'),
      roleOf('backend', { role: 'yjs', primary: false }),
      roleOf('backend', { role: 'mcp', primary: false }),
    ];
    await switchMachines({ roles, pending: roles.map((role) => role.role), record: { schemaVersion: 1, roles: {} }, target, switched: [] }, fx);
    expect(concurrent()).toBe(1);
  });
});
