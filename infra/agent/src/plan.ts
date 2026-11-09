import { posix } from 'node:path';
import { isRecord } from '../../lib/utils/guards';

/**
 * The contract between the engine that writes a machine's user data (lib/deploy/machine-user-data.ts) and the agent that reads it: the
 * boot plan below and the manifest (manifest.ts). A change to either bumps it. The agent is built from the release and the plan written
 * by the applied engine, so it is part of the applied description: a release that bumps it ends `apply needed` until an apply publishes
 * an engine that writes it, and the agent refuses a plan of another version.
 */
export const supportedSchemaVersion = 3;
export const supportedImageContract = 'docker-node-boot-v1';

/** One image archive of the release: the image it holds, the link it is fetched through and the sha256 it must have. */
export interface ReleaseArchive {
  name: string;
  image: string;
  url: string;
  sha256: string;
}

/** One service the agent answers the load balancer's check for: on `agentPort`, from the service's own `/health` on `port`. */
export interface AgentPort {
  service: string;
  agentPort: number;
  port: number;
}

export interface BootPlan {
  schemaVersion: typeof supportedSchemaVersion;
  service: string;
  profile: string;
  /** Compose services to start, named explicitly; the one-shot release companion starts as their dependency. */
  services: [string, ...string[]];
  releaseSha: string;
  imageContract: typeof supportedImageContract;
  /**
   * The links the deploy signed for the first boot, which end within minutes and which the deploy strips from the user data once the boot
   * account arrived: the env file, the app's image archives and the boot account's upload. A reboot fetches nothing.
   */
  links: { env: string; bootAccount: string; archives: ReleaseArchive[] };
  bootDiagnostics: { logFile: string };
  /** The compose file cloud-init wrote beside the static `.env`. */
  docker: { composeFile: string };
  /** The health ports the agent serves, and how long a drain keeps connections before the containers stop. */
  agent: { ports: AgentPort[]; drainSeconds: number };
  /** `composeWaitSeconds` bounds the release companion and the start together; see lib/deploy/machine-user-data.ts for how it fits the deploy's wait. */
  timeouts: { privateNetworkSeconds: number; fetchAttempts: number; fetchRetrySeconds: number; composeWaitSeconds: number };
}

const topLevelKeys = new Set([
  'schemaVersion',
  'service',
  'profile',
  'services',
  'releaseSha',
  'imageContract',
  'links',
  'bootDiagnostics',
  'docker',
  'agent',
  'timeouts',
]);

function stringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`boot plan: '${key}' must be a non-empty string`);
  return value;
}

function numberField(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`boot plan: '${key}' must be a positive number`);
  return value;
}

/** A link: https only, so a plan cannot send a fetch or an upload anywhere a plain connection reaches. */
function linkField(obj: Record<string, unknown>, key: string): string {
  const value = stringField(obj, key);
  if (!value.startsWith('https://')) throw new Error(`boot plan: '${key}' must be an https link`);
  return value;
}

function objectField(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = obj[key];
  if (!isRecord(value)) throw new Error(`boot plan: '${key}' must be an object`);
  return value;
}

function assertKnownTopLevel(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (!topLevelKeys.has(key)) throw new Error(`boot plan: unknown top-level field '${key}'`);
  }
}

/**
 * A plan names files in three places: the app directory, the boot log, and the plan's own config directory
 * (`/etc/<slug>`, the only /etc directory the launcher mounts). A path must already be in normal form, so `..`, `.` and
 * `//` segments cannot climb out of an allowed prefix.
 */
function assertAllowedPath(path: string, configDir: string): void {
  const allowedPrefixes = ['/opt/app/', '/var/log/', `${configDir}/`];
  if (posix.normalize(path) === path && allowedPrefixes.some((prefix) => path.startsWith(prefix))) return;
  throw new Error(`boot plan: path '${path}' is outside the allowed boot paths`);
}

function servicesField(obj: Record<string, unknown>): [string, ...string[]] {
  const value = obj.services;
  if (!Array.isArray(value) || value.length === 0) throw new Error("boot plan: 'services' must be a non-empty array");
  const services = value.map((part) => {
    if (typeof part !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(part)) throw new Error("boot plan: 'services' holds a name compose would not take");
    return part;
  });
  // Validated non-empty above, so the tuple type lets consumers destructure without a non-null assertion.
  return services as [string, ...string[]];
}

function portField(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`boot plan: '${key}' must be a port`);
  return value;
}

function agentField(obj: Record<string, unknown>): BootPlan['agent'] {
  const agent = objectField(obj, 'agent');
  if (!Array.isArray(agent.ports)) throw new Error("boot plan: 'agent.ports' must be an array");
  const ports = agent.ports.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`boot plan: agent.ports[${index}] must be an object`);
    const service = stringField(entry, 'service');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(service)) throw new Error(`boot plan: agent port of '${service}' names no service`);
    return { service, agentPort: portField(entry, 'agentPort'), port: portField(entry, 'port') };
  });
  const drainSeconds = agent.drainSeconds;
  if (typeof drainSeconds !== 'number' || !Number.isFinite(drainSeconds) || drainSeconds < 0)
    throw new Error("boot plan: 'agent.drainSeconds' must be a number");
  return { ports, drainSeconds };
}

function archivesField(links: Record<string, unknown>): ReleaseArchive[] {
  const value = links.archives;
  if (!Array.isArray(value)) throw new Error("boot plan: 'archives' must be an array");
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`boot plan: archives[${index}] must be an object`);
    const name = stringField(entry, 'name');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`boot plan: archive '${name}' is no archive name`);
    const sha256 = stringField(entry, 'sha256');
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`boot plan: archive '${name}' has no sha256`);
    return { name, image: stringField(entry, 'image'), url: linkField(entry, 'url'), sha256 };
  });
}

/** Parse and validate the boot plan read from `planPath`; the plan's own directory is the one /etc directory it may name. */
export function parseBootPlanJson(json: string, planPath: string): BootPlan {
  const configDir = posix.dirname(posix.normalize(planPath));
  const parsed = JSON.parse(json) as unknown;
  if (!isRecord(parsed)) throw new Error('boot plan: root must be an object');
  assertKnownTopLevel(parsed);

  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion !== supportedSchemaVersion) throw new Error(`boot plan: unsupported schemaVersion '${String(schemaVersion)}'`);
  const imageContract = parsed.imageContract;
  if (imageContract !== supportedImageContract) throw new Error(`boot plan: unsupported imageContract '${String(imageContract)}'`);

  const links = objectField(parsed, 'links');
  const bootDiagnostics = objectField(parsed, 'bootDiagnostics');
  const docker = objectField(parsed, 'docker');
  const timeouts = objectField(parsed, 'timeouts');

  const logFile = stringField(bootDiagnostics, 'logFile');
  const composeFile = stringField(docker, 'composeFile');
  for (const path of [logFile, composeFile]) assertAllowedPath(path, configDir);

  return {
    schemaVersion,
    service: stringField(parsed, 'service'),
    profile: stringField(parsed, 'profile'),
    services: servicesField(parsed),
    releaseSha: stringField(parsed, 'releaseSha'),
    imageContract,
    links: { env: linkField(links, 'env'), bootAccount: linkField(links, 'bootAccount'), archives: archivesField(links) },
    bootDiagnostics: { logFile },
    docker: { composeFile },
    agent: agentField(parsed),
    timeouts: {
      privateNetworkSeconds: numberField(timeouts, 'privateNetworkSeconds'),
      fetchAttempts: numberField(timeouts, 'fetchAttempts'),
      fetchRetrySeconds: numberField(timeouts, 'fetchRetrySeconds'),
      composeWaitSeconds: numberField(timeouts, 'composeWaitSeconds'),
    },
  };
}
