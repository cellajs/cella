import { composeConfig } from '../compose/compose';
import { generalConfig } from '../config/general.config';
import { accountFailed } from '../lib/deploy/boot-accounts';
import type { DeployTarget, LiveRecord, LiveRole } from '../lib/deploy/live-record';
import { MANIFEST_KEY, renderMachineUserData, renderManifest } from '../lib/deploy/machine-user-data';
import { AGENT_IMAGE_NAME, imageRepositoryOf, type ReleaseManifest, releaseArchiveKey } from '../lib/deploy/release-archives';
import { staticEnv } from '../lib/deploy/static-env';
import type { EnvSupplier, EnvSupplierContext } from '../lib/env-suppliers';
import {
  agentPort,
  checkedServicesOf,
  instanceTypeOf,
  isRouted,
  type MachineRole,
  machineName,
  otherSlot,
  type Slot,
  slotOfMachine,
  startServicesOf,
} from '../lib/machine-roles';
import type { InfraDerivations } from '../lib/naming';
import type { Foundation } from '../lib/scaleway/foundation';
import { createMachine, deleteMachine, getUserData, listMachines, readMachine, setUserData } from '../lib/scaleway/machines';
import type { Presigner } from '../lib/scaleway/presign';
import type { Environment } from '../lib/stack/bootstrap-stack-state';
import { deployEvents, emitDeployEvent } from '../lib/telemetry/deploy-telemetry';
import { errorMessage } from '../lib/utils/errors';
import type { MachineEnv } from './compose-env';
import { lbServerStats, waitForPools } from './wait-for-version';

/**
 * How long a deploy waits for a new machine to serve, from its power-on: the boot, the archives and the env file, then the release
 * companion and the start, which `composeWaitTimeoutSeconds` (lib/deploy/machine-user-data.ts) bounds, inside this.
 */
export const SERVING_TIMEOUT_SECONDS = 480;

/** How long a deploy waits for a drained machine's check to turn red: the agent's next manifest read plus the load balancer's 1.3 s (M1). */
export const OUT_TIMEOUT_SECONDS = 60;

/** Time a drained machine gets past its drain seconds to stop its containers, before the deploy powers it off. */
const STOP_MARGIN_MS = 5_000;

/** A machine of a role, by its slot. */
export interface RoleMachine {
  id: string;
  slot: Slot;
}

/** What a switch does outside this module, so a test passes its own. */
export interface SwitchEffects {
  /** Every machine named for one of the role's slots, the live one included. */
  machinesOf(role: string): Promise<RoleMachine[]>;
  /** Make the role's machine of the release on a slot and power it on; returns its id, and deletes it itself when the making fails. */
  boot(role: MachineRole, slot: Slot): Promise<string>;
  /** Wait until the slot's address serves in every pool of the role, or its boot account arrived for a role no pool lists. */
  serving(role: MachineRole, slot: Slot): Promise<'serving' | 'failed' | 'timeout'>;
  /** Set `drain` in the machine's manifest: its agent answers 503, waits the drain seconds, and stops the containers. */
  drain(role: string, machine: string): Promise<void>;
  /** Wait until no pool of the role routes to the slot's address; false at the timeout. */
  out(role: MachineRole, slot: Slot): Promise<boolean>;
  remove(machine: string): Promise<void>;
  /** Set or clear the role's entry of the live record. */
  record(role: string, entry: LiveRole | undefined): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}

/** One role switched: the slot and machine that serve it now. */
export interface SwitchResult {
  role: string;
  slot: Slot;
  machine: string;
}

/** A switch that failed after its stop-first role lost the old machine: the new one stays with its env file, as a late boot may still serve. */
export class KeptMachineError extends Error {
  constructor(
    message: string,
    readonly kept: SwitchResult,
  ) {
    super(message);
  }
}

/**
 * Take a machine out of service and delete it: drain it, wait until no pool routes to it, let it keep its connections for the role's drain
 * seconds and stop its containers, then delete it.
 */
async function retire(role: MachineRole, machine: RoleMachine, fx: SwitchEffects): Promise<void> {
  await fx.drain(role.role, machine.id);
  if (isRouted(role) && !(await fx.out(role, machine.slot))) {
    fx.log(`[switch ${role.role}] slot ${machine.slot} still takes traffic ${OUT_TIMEOUT_SECONDS} s after its drain; it is deleted all the same`);
  }
  await fx.sleep(role.drainSeconds * 1000 + STOP_MARGIN_MS);
  await fx.remove(machine.id);
}

/**
 * Switch one role to the target: boot the new machine on the slot that does not serve, wait until it serves, record it, then drain and
 * delete the old one. A stop-first role (one replication slot, one scheduler) drains and deletes the old first, then boots the new. A
 * machine of the role that the live record does not name, which a run that died left, is drained and deleted before anything boots.
 * Before the switch a failure deletes the new machine and leaves the old serving; after it, the new one stays, recorded when it serves and
 * kept for its boot account when it does not.
 * @throws naming the role, the slot and how the new machine ended
 */
export async function switchRole(plan: { role: MachineRole; live?: LiveRole; target: DeployTarget }, fx: SwitchEffects): Promise<SwitchResult> {
  const { role, live, target } = plan;
  const name = role.role;
  const slot = live ? otherSlot(live.slot) : 'a';
  for (const stray of (await fx.machinesOf(name)).filter((machine) => machine.id !== live?.machine)) {
    fx.log(`[switch ${name}] slot ${stray.slot} holds ${stray.id}, which the live record does not name: drained and deleted`);
    await retire(role, stray, fx);
  }
  const stopFirst = role.strategy === 'stop-first' && live !== undefined;
  if (stopFirst) {
    fx.log(`[switch ${name}] stop-first: draining and deleting slot ${live.slot} before slot ${slot} boots`);
    await retire(role, { id: live.machine, slot: live.slot }, fx);
    await fx.record(name, undefined);
  }
  fx.log(`[switch ${name}] booting ${target.commit.slice(0, 10)} on slot ${slot}`);
  const machine = await fx.boot(role, slot);
  const outcome = await fx.serving(role, slot);
  if (outcome !== 'serving') {
    const how = outcome === 'failed' ? 'its boot failed' : `it did not serve within ${SERVING_TIMEOUT_SECONDS} s`;
    if (stopFirst) {
      throw new KeptMachineError(`${name}: ${how} on slot ${slot}; the old machine is gone, so the new one stays for its boot account`, {
        role: name,
        slot,
        machine,
      });
    }
    await fx.remove(machine).catch((error: unknown) => fx.log(`[switch ${name}] ${machine} could not be deleted: ${errorMessage(error)}`));
    throw new Error(`${name}: ${how} on slot ${slot}; the new machine is deleted${live ? ` and slot ${live.slot} keeps serving` : ''}`);
  }
  await fx.record(name, { slot, machine, commit: target.commit, retry: target.retry, rotation: target.rotation });
  fx.log(`[switch ${name}] slot ${slot} serves ${target.commit.slice(0, 10)}`);
  if (live && !stopFirst) await retire(role, { id: live.machine, slot: live.slot }, fx);
  return { role: name, slot, machine };
}

/**
 * Switch every role that does not serve the target: the primary first and alone, as its release companion migrates before any other role
 * starts the new release, then every other one concurrently. A role whose switch failed keeps what it served, and the others finish.
 * Machines of a role the registry no longer declares are drained and deleted once every role switched. Each switched role goes to
 * `switched` as it switches and each kept one to `kept`, so a failed run still names the new machines.
 * @throws listing every role that failed
 */
export async function switchMachines(
  opts: {
    roles: readonly MachineRole[];
    pending: readonly string[];
    record: LiveRecord;
    target: DeployTarget;
    switched: SwitchResult[];
    /** Each stop-first role's new machine a failed switch kept. */
    kept: SwitchResult[];
  },
  effects: SwitchEffects,
): Promise<void> {
  // Roles switch concurrently and each writes the live record: one write at a time, so none loses a race after its machine serves.
  let writes: Promise<unknown> = Promise.resolve();
  const fx: SwitchEffects = {
    ...effects,
    record: (role, entry) => {
      const write = writes.then(() => effects.record(role, entry));
      writes = write.catch(() => undefined);
      return write;
    },
  };
  const one = async (role: MachineRole) => {
    try {
      opts.switched.push(await switchRole({ role, live: opts.record.roles[role.role], target: opts.target }, fx));
    } catch (error) {
      if (error instanceof KeptMachineError) opts.kept.push(error.kept);
      throw error;
    }
  };
  const pending = opts.roles.filter((role) => opts.pending.includes(role.role));
  const primary = pending.find((role) => role.primary);
  if (primary) await one(primary);
  const rest = pending.filter((role) => role !== primary);
  const outcomes = await Promise.allSettled(rest.map(one));
  const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [errorMessage(outcome.reason)] : []));
  if (failures.length > 0) throw new Error(`${failures.length} role(s) did not switch: ${failures.join('; ')}`);
  for (const [name, entry] of Object.entries(opts.record.roles)) {
    if (opts.roles.some((role) => role.role === name)) continue;
    fx.log(`[switch ${name}] the registry declares no such role any more: its machine is drained and deleted`);
    const gone: MachineRole = { role: name as MachineRole['role'], services: [], pools: [], strategy: 'stop-first', drainSeconds: 0, primary: false };
    await retire(gone, { id: entry.machine, slot: entry.slot }, fx);
    await fx.record(name, undefined);
  }
}

/** How long a machine's links to its env file and archives last: it fetches them within minutes of its power-on. */
const FETCH_LINK_SECONDS = 15 * 60;

/** How long a machine's boot account link lasts: through a boot that fails at the end of the deploy's wait. */
const ACCOUNT_LINK_SECONDS = 30 * 60;

/** What the live effects work from: the deploy key, the foundation the last apply made, and the release the build checked. */
export interface LiveSwitchContext {
  secretKey: string;
  projectId: string;
  zone: string;
  mode: Environment;
  naming: InfraDerivations['naming'];
  foundation: Foundation;
  sha: string;
  manifest: ReleaseManifest;
  envs: readonly MachineEnv[];
  presigner: Presigner;
  /** The boot account of the key, or undefined while none is there. */
  readAccount(key: string): Promise<string | undefined>;
  /** Set or clear one role's entry of the live record. */
  record(role: string, entry: LiveRole | undefined): Promise<void>;
  suppliers: Readonly<Record<string, EnvSupplier>>;
  supplierContext: EnvSupplierContext;
  composeContent: string;
  traceparent?: string;
  telemetry?: { endpoint: string; keyHeader: string; keyEnvVar: string };
  log(message: string): void;
}

/** The switch's effects on Scaleway, with the deploy key: machines through the Instance API, the pools read through their stats. */
export function liveSwitchEffects(ctx: LiveSwitchContext): SwitchEffects {
  const auth = { secretKey: ctx.secretKey };
  const stats = lbServerStats(auth, ctx.zone, ctx.foundation.lbId);
  const registry = `rg.${ctx.supplierContext.region}.scw.cloud/${ctx.naming.registryNamespace}`;
  const envOf = (role: string) => {
    const env = ctx.envs.find((entry) => entry.service === role);
    if (!env) throw new Error(`switch: the compose step wrote no env file for ${role}`);
    return env;
  };
  const archive = async (name: string) => {
    const digest = ctx.manifest.images[name];
    if (!digest) throw new Error(`switch: the release's manifest names no archive '${name}'`);
    const url = await ctx.presigner.get(releaseArchiveKey(ctx.sha, name), FETCH_LINK_SECONDS);
    return { name, image: `${registry}/${name}:${ctx.sha}`, url, sha256: digest.sha256 };
  };
  const failed = async (role: string) => {
    const body = await ctx.readAccount(envOf(role).bootAccount);
    return body !== undefined && accountFailed(body);
  };
  const poolsOf = (role: MachineRole) => role.pools.map((pool) => ctx.foundation.backends[pool.key] ?? '');
  const addressOf = (role: MachineRole, slot: Slot) => ctx.foundation.slots[role.role]?.[slot];
  return {
    async machinesOf(role) {
      const machines = await listMachines(auth, { zone: ctx.zone, projectId: ctx.projectId, prefix: ctx.naming.resource(`${role}-`) });
      return machines.flatMap((machine) => {
        const slot = slotOfMachine(ctx.naming.resource, role, machine.name);
        return slot ? [{ id: machine.id, slot }] : [];
      });
    },
    async boot(role, slot) {
      const own = role.services.find((service) => service.slug === role.role);
      if (!own) throw new Error(`switch: ${role.role} carries no service of its own name`);
      const env = envOf(role.role);
      const startServices = startServicesOf(role);
      const archives = [...new Set(startServices.map((slug) => imageRepositoryOf(composeConfig.services[slug]?.image ?? '')))];
      const agent = await archive(AGENT_IMAGE_NAME);
      const cloudInit = renderMachineUserData({
        slug: ctx.naming.slug,
        role: role.role,
        startServices,
        releaseSha: ctx.sha,
        envFileContent: staticEnv({
          role,
          registry,
          release: ctx.sha,
          agentDir: `/etc/${ctx.naming.slug}`,
          lbInternalAddress: ctx.foundation.lbPrivateAddress,
          suppliers: ctx.suppliers,
          context: ctx.supplierContext,
        }),
        composeContent: ctx.composeContent,
        agentImage: { image: agent.image, url: agent.url, sha256: agent.sha256 },
        links: {
          env: await ctx.presigner.get(env.env, FETCH_LINK_SECONDS),
          bootAccount: await ctx.presigner.put(env.bootAccount, ACCOUNT_LINK_SECONDS),
          archives: await Promise.all(archives.map(archive)),
        },
        agentPorts: checkedServicesOf(role).map((service) => ({
          service: service.slug,
          agentPort: agentPort(service.slug),
          port: service.healthPort,
        })),
        drainSeconds: role.drainSeconds,
        ...(ctx.traceparent ? { traceparent: ctx.traceparent } : {}),
        ...(ctx.telemetry ? { telemetry: ctx.telemetry } : {}),
      });
      const securityGroupId = ctx.foundation.securityGroups[role.role];
      if (!securityGroupId) throw new Error(`switch: no security group for ${role.role}; an apply makes it`);
      const server = await createMachine(auth, ctx.zone, {
        name: machineName(ctx.naming.resource, role.role, slot),
        type: instanceTypeOf(own, ctx.mode),
        image: generalConfig.compute.image,
        projectId: ctx.projectId,
        securityGroupId,
        tags: ['machine', `role=${role.role}`, `slot=${slot}`, `sha=${ctx.sha}`],
        userData: { 'cloud-init': cloudInit, [MANIFEST_KEY]: renderManifest({ role: role.role, release: ctx.sha, drain: false }) },
        privateNic: { privateNetworkId: ctx.foundation.privateNetworkId, ...(isRouted(role) ? { ipamIpId: addressOf(role, slot)?.id } : {}) },
      });
      return server.id;
    },
    async serving(role, slot) {
      const deadline = Date.now() + SERVING_TIMEOUT_SECONDS * 1000;
      if (isRouted(role)) {
        const address = addressOf(role, slot)?.address ?? '';
        const outcome = await waitForPools({
          backendIds: poolsOf(role),
          address,
          want: 'serving',
          stats,
          timeoutMs: SERVING_TIMEOUT_SECONDS * 1000,
          failed: () => failed(role.role),
        });
        return outcome === 'done' ? 'serving' : outcome;
      }
      // No pool checks this role: its boot account says whether its release started.
      while (Date.now() < deadline) {
        const body = await ctx.readAccount(envOf(role.role).bootAccount).catch(() => undefined);
        if (body !== undefined) return accountFailed(body) ? 'failed' : 'serving';
        await new Promise((done) => setTimeout(done, 5_000));
      }
      return 'timeout';
    },
    async drain(role, machine) {
      // A machine already gone is drained as asked: the next step deletes nothing.
      if (!(await readMachine(auth, ctx.zone, machine))) return;
      const current = await getUserData(auth, ctx.zone, machine, MANIFEST_KEY).catch(() => '');
      let release = '';
      try {
        release = (JSON.parse(current) as { release?: string }).release ?? '';
      } catch {
        // A machine of an engine before the agent holds no manifest: the drain order is written all the same.
      }
      await setUserData(auth, ctx.zone, machine, MANIFEST_KEY, renderManifest({ role, release, drain: true }));
    },
    async out(role, slot) {
      const outcome = await waitForPools({
        backendIds: poolsOf(role),
        address: addressOf(role, slot)?.address ?? '',
        want: 'out',
        stats,
        timeoutMs: OUT_TIMEOUT_SECONDS * 1000,
        intervalMs: 1_000,
      });
      return outcome === 'done';
    },
    remove: (machine) => deleteMachine(auth, ctx.zone, machine),
    async record(role, entry) {
      await ctx.record(role, entry);
      if (entry) emitDeployEvent(deployEvents.roleSwitched, { role, sha: entry.commit, slot: entry.slot });
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    log: ctx.log,
  };
}
