import { spawnSync } from 'node:child_process';
import type { EngineConfig } from '../config/engine-config';
import { readLiveRecord, recordRole } from '../lib/deploy/live-record';
import { machineRoles, slotOfMachine } from '../lib/machine-roles';
import { deriveInfra } from '../lib/naming';
import { readLoadBalancer, readSlotAddresses } from '../lib/scaleway/foundation';
import { deleteMachine, listMachines } from '../lib/scaleway/machines';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { controlActor, putJsonObject, readObjectText, readRotations, rotationsKey, type S3Like, stateBucket } from '../lib/stack/control-store';
import { errorMessage } from '../lib/utils/errors';
import { isRecord } from '../lib/utils/guards';
import { infraDir } from '../lib/utils/paths';

/** The stack config the apply reads to keep the machines the program made in the pools beside the reserved addresses (resources/slots.ts). */
export const LEGACY_SERVERS_KEY = 'bootstrap:legacyServers';

/** A machine the Pulumi program made before the deploy made them: named `<slug>-<service>-<generation id>`. */
export interface ProgramMachine {
  role: string;
  id: string;
  name: string;
}

/**
 * Where an environment stands in its move off the machines the program made: `prepare` while they serve and the pools do not list them
 * as legacy yet, `finish` once a deploy switched every role the live record named one of them for, `none` before and after the move and
 * while that deploy is owed.
 */
export function migrationStep(opts: {
  legacyConfigured: boolean;
  programMachines: readonly ProgramMachine[];
  liveMachines: readonly string[];
}): 'prepare' | 'finish' | 'none' {
  if (!opts.legacyConfigured) return opts.programMachines.length > 0 ? 'prepare' : 'none';
  return opts.programMachines.some((machine) => opts.liveMachines.includes(machine.id)) ? 'none' : 'finish';
}

/** The control object the deploy kept in the state bucket before the live record: each service's serving generation, and the rotations. */
function oldControl(text: string | undefined): { active: Record<string, { id: string; sha: string }>; rotations?: unknown } {
  if (!text) return { active: {} };
  const raw = JSON.parse(text) as unknown;
  if (!isRecord(raw)) return { active: {} };
  const active: Record<string, { id: string; sha: string }> = {};
  for (const [service, entry] of Object.entries(isRecord(raw.rollout) ? raw.rollout : {})) {
    const gen = isRecord(entry) && isRecord(entry.active) ? entry.active : undefined;
    if (typeof gen?.id === 'string' && typeof gen.sha === 'string' && /^[0-9a-f]{7,40}$/.test(gen.sha))
      active[service] = { id: gen.id, sha: gen.sha };
  }
  return { active, ...(raw.rotations === undefined ? {} : { rotations: raw.rotations }) };
}

/** What the move does outside this module, on the operator key. */
interface MoveContext {
  appConfig: EngineConfig;
  stack: string;
  secretKey: string;
  projectId: string;
  /** The operator's S3 key on the environment's buckets. */
  s3: S3Like;
  /** The provider env the apply logged in with, for `pulumi config`. */
  env: NodeJS.ProcessEnv;
  log(message: string): void;
}

/**
 * Move an environment off the machines its Pulumi program made, in the apply, before the retired resources leave the state. Prepare: the
 * pools keep each one's address beside the reserved ones (`bootstrap:legacyServers`), the live record names each as its role's machine on
 * slot b, so the next deploy boots slot a, waits until it serves, and drains and deletes it, and the rotations move beside the live record.
 * Finish, at the apply after that deploy: their addresses and flexible IPs are released and the pools drop them.
 */
export async function moveMachinesOutOfProgram(ctx: MoveContext): Promise<'prepare' | 'finish' | 'none'> {
  const { naming, region, zone } = deriveInfra(ctx.appConfig);
  const mode = ctx.appConfig.mode;
  const auth = { secretKey: ctx.secretKey };
  const config = (args: string[]) =>
    spawnSync('pulumi', ['config', ...args, '--stack', ctx.stack], { cwd: infraDir, env: ctx.env, encoding: 'utf8' });
  const read = config(['get', LEGACY_SERVERS_KEY]);
  const configured = read.status === 0 ? read.stdout.trim() : undefined;
  const write = (args: string[]) => {
    const run = config(args);
    if (run.status !== 0) throw new Error(`pulumi config ${args[0]} ${LEGACY_SERVERS_KEY} failed: ${run.stderr.trim()}`);
  };
  const roles = machineRoles(ctx.appConfig);
  const programMachines: ProgramMachine[] = [];
  for (const { role } of roles) {
    for (const machine of await listMachines(auth, { zone, projectId: ctx.projectId, prefix: naming.resource(`${role}-`) })) {
      const rest = machine.name.slice(naming.resource(`${role}-`).length);
      if (!slotOfMachine(naming.resource, role, machine.name) && /^[0-9a-f]{6,}$/.test(rest)) {
        programMachines.push({ role, id: machine.id, name: machine.name });
      }
    }
  }
  const { record } = await readLiveRecord(ctx.s3, naming.bootDiagBucket, ctx.stack);
  const step = migrationStep({
    legacyConfigured: configured !== undefined,
    programMachines,
    liveMachines: Object.values(record.roles).map((entry) => entry.machine),
  });

  if (step === 'prepare') {
    const lb = await readLoadBalancer(auth, { zone, projectId: ctx.projectId, naming });
    if (!lb) throw new Error(`no load balancer ${naming.resource('lb')} to read the serving machines from`);
    // A pool that lists a reserved address already, after a half-done move, keeps that one as its own: only the program's machines are legacy.
    const reserved = new Set(
      Object.values(await readSlotAddresses(auth, { region, projectId: ctx.projectId, naming, mode, roles })).flatMap((bySlot) =>
        Object.values(bySlot).map((slot) => slot.address),
      ),
    );
    const legacy: Record<string, string[]> = {};
    for (const pool of roles.flatMap((role) => role.pools)) {
      const servers = (lb.backends.find((backend) => backend.name === naming.resource(pool.key))?.pool ?? []).filter((ip) => !reserved.has(ip));
      if (servers.length > 0) legacy[pool.key] = servers;
    }
    write(['set', LEGACY_SERVERS_KEY, JSON.stringify(legacy)]);
    ctx.log(
      `The pools keep ${[...new Set(Object.values(legacy).flat())].join(', ')} beside the reserved addresses until the next deploy's machines serve.`,
    );

    const { body } = await readObjectText(ctx.s3, stateBucket(naming.slug), `control/${mode}.json`).catch(() => ({ body: undefined }));
    const old = oldControl(body);
    const { rotations, etag } = await readRotations(ctx.s3, naming.bootDiagBucket, ctx.stack);
    if (!etag && old.rotations !== undefined) {
      await putJsonObject(ctx.s3, naming.bootDiagBucket, rotationsKey(ctx.stack), `${JSON.stringify(old.rotations, null, 2)}\n`, {
        ifNoneMatch: '*',
      });
    }
    const counter = !etag && isRecord(old.rotations) && typeof old.rotations.counter === 'number' ? old.rotations.counter : rotations.counter;
    for (const { role } of roles) {
      if (record.roles[role]) continue;
      // The serving generation, when the control object names one; the finish deletes any other the program left.
      const own = programMachines.filter((machine) => machine.role === role);
      const machine = own.find((candidate) => candidate.name === naming.resource(`${role}-${old.active[role]?.id}`)) ?? own[0];
      if (!machine) continue;
      // No retry counter is below 0, so the next deploy replaces it whatever its target: the program's machine runs no agent.
      const commit = old.active[role]?.sha ?? '0000000';
      await recordRole(
        ctx.s3,
        naming.bootDiagBucket,
        ctx.stack,
        machine.role,
        { slot: 'b', machine: machine.id, commit, retry: -1, rotation: counter },
        { by: controlActor() },
      );
      ctx.log(
        `The live record names ${machine.name} as ${machine.role}'s machine: the next deploy boots slot a beside it, then drains and deletes it.`,
      );
    }
  }

  if (step === 'finish') {
    for (const machine of programMachines) {
      await deleteMachine(auth, zone, machine.id);
      ctx.log(`Deleted ${machine.name}, which no pool routed to any more.`);
    }
    const legacy = JSON.parse(configured ?? '{}') as Record<string, string[]>;
    await releaseLeftovers({ auth, region, zone, projectId: ctx.projectId, naming, addresses: new Set(Object.values(legacy).flat()), log: ctx.log });
    write(['rm', LEGACY_SERVERS_KEY]);
    ctx.log('The pools list the reserved addresses alone, checked by the agent.');
  }
  return step;
}

/** Release what the program's machines left once a deploy deleted them: their reserved private addresses, and their flexible public IPs. */
async function releaseLeftovers(opts: {
  auth: { secretKey: string };
  region: string;
  zone: string;
  projectId: string;
  naming: ReturnType<typeof deriveInfra>['naming'];
  addresses: ReadonlySet<string>;
  log(message: string): void;
}): Promise<void> {
  const ipam = `https://api.scaleway.com/ipam/v1/regions/${opts.region}`;
  const { ips } = await scwFetch<{ ips: Array<{ id: string; address: string; resource?: unknown }> }>(
    opts.auth,
    'GET',
    `${ipam}/ips?project_id=${opts.projectId}&is_ipv6=false&attached=false&page_size=100`,
  );
  for (const ip of ips.filter((candidate) => opts.addresses.has(candidate.address.split('/')[0] ?? ''))) {
    await scwSend(opts.auth, 'DELETE', `${ipam}/ips/${ip.id}`).then(
      () => opts.log(`Released ${ip.address}.`),
      (error) => opts.log(`${ip.address} stays reserved (${errorMessage(error)}).`),
    );
  }
  const instance = `https://api.scaleway.com/instance/v1/zones/${opts.zone}`;
  const { ips: flexible } = await scwFetch<{ ips: Array<{ id: string; address: string; server?: unknown; tags?: string[] }> }>(
    opts.auth,
    'GET',
    `${instance}/ips?project=${opts.projectId}&per_page=100`,
  );
  for (const ip of flexible.filter((candidate) => !candidate.server && candidate.tags?.includes(`app=${opts.naming.slug}`))) {
    await scwSend(opts.auth, 'DELETE', `${instance}/ips/${ip.id}`).then(
      () => opts.log(`Released the flexible IP ${ip.address}.`),
      (error) => opts.log(`The flexible IP ${ip.address} stays (${errorMessage(error)}).`),
    );
  }
}
