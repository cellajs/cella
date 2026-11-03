import type { ServiceName } from '../compose/compose';
import type { ReplacementStrategy } from '../compose/types';
import type { EngineConfig } from '../config/engine-config';
import { generalConfig } from '../config/general.config';
import { type PerMode, resolvePerMode } from './general-config';
import { carriedServices, deployedServices, type ServiceDefinition, services } from './services';
import type { Environment } from './stack/bootstrap-stack-state';

/** One of a role's two reserved addresses. A deploy boots the new machine on the slot that does not serve. */
export type Slot = 'a' | 'b';

export const SLOTS: readonly Slot[] = ['a', 'b'];

export const otherSlot = (slot: Slot): Slot => (slot === 'a' ? 'b' : 'a');

/** The agent's health ports start here: a service's is this plus its position in the registry. */
const AGENT_PORT_BASE = 9000;

/** The port on which a machine's agent answers the load balancer's check for `slug` at `/health/<slug>`. */
export function agentPort(slug: string): number {
  const index = services.findIndex((service) => service.slug === slug);
  if (index < 0) throw new Error(`machine-roles: '${slug}' is no service of the registry`);
  return AGENT_PORT_BASE + index;
}

/** The path the load balancer checks on a service's agent port. */
export const agentHealthPath = (slug: string): string => `/health/${slug}`;

/** Inbound port of a service's internal LB frontend: its internal listener's port shifted into a 10xxx range, clear of 80/443 and every service port. */
export function internalLbPort(internalPort: number): number {
  const port = 10000 + internalPort;
  if (port > 65535) throw new Error(`internal LB port ${port} exceeds the valid range (internal port ${internalPort})`);
  return port;
}

/** One load balancer pool on a role's addresses: a service's public pool, keyed by its slug, or its internal pool, keyed `<slug>-internal`. */
export interface RolePool {
  key: string;
  service: ServiceName;
  /** The port the pool forwards to on the machine. */
  port: number;
}

/**
 * A kind of machine of an environment: in split form one per service with a machine of its own, in single-process form the host, which
 * carries every service. Each deploy replaces every role's machine.
 */
export interface MachineRole {
  role: ServiceName;
  /** The services the machine runs: its own, and on the single-process host every co-hosted and collocated one. */
  services: readonly ServiceDefinition[];
  pools: readonly RolePool[];
  strategy: ReplacementStrategy;
  /** Seconds a draining machine keeps its connections after its check turns red: the longest of its services'. */
  drainSeconds: number;
  /** Booted first and alone: its release companion migrates before any other role starts the new release. */
  primary: boolean;
}

/** Whether a role takes traffic from the load balancer, and so holds two reserved addresses and the pools that list them. */
export const isRouted = (role: Pick<MachineRole, 'pools'>): boolean => role.pools.length > 0;

/** The pools a service has: its public one when it declares an LB route, its internal one when it declares an internal listener. */
function servicePools(service: ServiceDefinition): RolePool[] {
  return [
    ...(service.lbRoute ? [{ key: service.slug, service: service.slug, port: service.healthPort }] : []),
    ...(service.internalPort === undefined ? [] : [{ key: `${service.slug}-internal`, service: service.slug, port: service.internalPort }]),
  ];
}

/** The environment's machine roles, the primary first. */
export function machineRoles(appConfig: Pick<EngineConfig, 'services' | 'singleVM'>): MachineRole[] {
  const roles = deployedServices(appConfig.services, appConfig.singleVM).map((machine): MachineRole => {
    const carried = carriedServices(appConfig.services, appConfig.singleVM, machine);
    return {
      role: machine.slug,
      services: carried,
      pools: carried.flatMap(servicePools),
      strategy: machine.replacementStrategy,
      drainSeconds: Math.max(0, ...carried.map((service) => service.drainSeconds)),
      primary: machine.primaryRollout === true,
    };
  });
  const primaries = roles.filter((role) => role.primary);
  if (primaries.length > 1) throw new Error(`At most one enabled service may set primaryRollout: true (${primaries.map((r) => r.role).join(', ')})`);
  return [...primaries, ...roles.filter((role) => !role.primary)];
}

/** The role whose machine serves `slug`: its own when it has one, the single-process host when it runs there, undefined when it is disabled. */
export function roleOf(appConfig: Pick<EngineConfig, 'services' | 'singleVM'>, slug: string): ServiceName | undefined {
  return machineRoles(appConfig).find((role) => role.services.some((service) => service.slug === slug))?.role;
}

/** The tag that names a role's reserved address of one slot: `<slug>-<mode>-<role>-<slot>`, which the deploy finds it by. */
export function slotName(slug: string, mode: string, role: string, slot: Slot): string {
  return `${slug}-${mode}-${role}-${slot}`;
}

/** The name of the machine a deploy boots for a role on a slot. */
export function machineName(resource: (suffix: string) => string, role: string, slot: Slot): string {
  return resource(`${role}-${slot}`);
}

/** The slot a machine name holds, when it is one of a role's. */
export function slotOfMachine(resource: (suffix: string) => string, role: string, name: string): Slot | undefined {
  return SLOTS.find((slot) => machineName(resource, role, slot) === name);
}

/** A role's machine type, from its registry entry. */
export function instanceTypeOf(role: Pick<ServiceDefinition, 'slug' | 'instanceType'>, mode: Environment): string {
  const size: PerMode<string> = role.instanceType;
  const resolved = typeof size === 'string' ? size : size[mode];
  if (resolved === undefined) throw new Error(`Service '${role.slug}' has no instanceType for mode '${mode}' in config/services.config.ts.`);
  return resolved;
}

/** The marketplace image or image id every machine boots from. */
export const machineImage = (mode: Environment): string => resolvePerMode(generalConfig.compute.image, mode);

/** The compose services the agent starts on a role's machine: its own, and on the single-process host each collocated container. */
export function startServicesOf(role: Pick<MachineRole, 'role' | 'services'>): [ServiceName, ...ServiceName[]] {
  return [role.role, ...role.services.filter((service) => service.slug !== role.role && service.placement === 'host').map((s) => s.slug)];
}

/** The services the agent answers the load balancer for on a role's machine: each it carries that a pool checks. */
export function checkedServicesOf(role: Pick<MachineRole, 'services'>): ServiceDefinition[] {
  return role.services.filter((service) => servicePools(service).length > 0);
}
