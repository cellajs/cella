import { composeConfig, type ServiceName } from '../../compose/compose';
import type { EngineConfig } from '../../config/engine-config';
import type { EnvSupplier, EnvSupplierContext } from '../env-suppliers';
import { internalLbPort, type MachineRole } from '../machine-roles';
import { deriveInfra } from '../naming';
import { type ServiceDefinition, serviceEndpoints, servicesByName } from '../services';

/** Placeholders the engine sets on every machine: the registry the release's images are named for, the mode, and the agent's own. */
const INJECTED_VARS = new Set(['REGISTRY', 'APP_MODE', 'AGENT_TAG', 'AGENT_DIR']);
const PLACEHOLDER_RE = /\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g;
const BINDING_RE = /@\{([a-z]+)\.([a-zA-Z]+)\}/g;

/** All `${VAR}` placeholders in the compose blocks that run in a service's profile. */
function composePlaceholders(slug: string): string[] {
  const vars = new Set<string>();
  for (const block of Object.values(composeConfig.services)) {
    if (!block.profiles.includes(slug)) continue;
    const texts = [block.image, ...(block.ports ?? []), ...Object.values(block.environment ?? {})];
    for (const text of texts) for (const match of text.matchAll(PLACEHOLDER_RE)) vars.add(match[1] ?? '');
  }
  return [...vars].filter(Boolean);
}

/** The compose `*_TAG` variable a service's image reference reads, e.g. backend to BACKEND_TAG. */
const tagVar = (slug: string): string => `${slug.toUpperCase()}_TAG`;

/** What a machine's static env is made from, beside its role. */
export interface StaticEnvInput {
  role: MachineRole;
  /** Where the release's images are named for: `rg.<region>.scw.cloud/<namespace>`. */
  registry: string;
  release: string;
  /** The folder of the machine's boot plan, which the agent's compose service mounts. */
  agentDir: string;
  /** The load balancer's private address, which `@{<slug>.internalHost}` resolves to. */
  lbInternalAddress: string;
  suppliers: Readonly<Record<string, EnvSupplier>>;
  context: EnvSupplierContext;
}

/** A binding owned by the service or folded in from a co-hosted worker; `loopback` collapses its host's address to 127.0.0.1. */
interface EffectiveBinding {
  template: string;
  owner: ServiceName;
  loopback?: boolean;
}

/**
 * A role's own bindings, and on the single-process host every service it carries: a co-hosted worker's resolve its host to loopback, as
 * they share one process, and a collocated container's resolve as written. Two templates for one variable throw.
 */
function effectiveBindings(role: MachineRole): Record<string, EffectiveBinding> {
  const bindings: Record<string, EffectiveBinding> = {};
  for (const service of role.services) {
    for (const [name, template] of Object.entries(service.bindings ?? {})) {
      const existing = bindings[name];
      if (existing && existing.template !== template) {
        throw new Error(
          `static env: binding '${name}' on '${service.slug}' (${template}) conflicts with '${existing.owner}' (${existing.template}): services on one machine must not overload a binding.`,
        );
      }
      bindings[name] = { template, owner: service.slug, ...(service.coHosted && service.slug !== role.role ? { loopback: true } : {}) };
    }
  }
  return bindings;
}

function bindingPart(input: StaticEnvInput, binding: EffectiveBinding, target: string, prop: string): string {
  const slug = (target === 'self' ? binding.owner : target) as ServiceName;
  const definition: ServiceDefinition | undefined = servicesByName.get(slug);
  if (!definition) throw new Error(`static env: binding @{${target}.${prop}} on '${binding.owner}' names no service '${slug}'.`);
  const onThisMachine = binding.loopback === true && slug === input.role.role;
  switch (prop) {
    case 'port':
      return String(definition.healthPort);
    case 'internalHost':
    case 'internalPort': {
      if (definition.internalPort === undefined)
        throw new Error(`static env: binding @{${target}.${prop}} on '${binding.owner}': '${slug}' has no internalPort.`);
      if (prop === 'internalHost') return onThisMachine ? '127.0.0.1' : input.lbInternalAddress;
      return String(onThisMachine ? definition.internalPort : internalLbPort(definition.internalPort));
    }
    case 'url':
      return input.context.serviceUrl(slug);
    default:
      // A role's address changes with every deploy, so no binding names one: `internalHost` is the address that follows each switch.
      throw new Error(
        `static env: unknown binding property '@{${target}.${prop}}' on '${binding.owner}' (use url, port, internalHost or internalPort).`,
      );
  }
}

/**
 * A role's static `.env`, one `NAME=value` per line: the registry, the mode, the release tag of every image it runs, the agent's tag and
 * folder, then each compose placeholder of its services from a binding or an app supplier. It holds no secret: the runtime values travel in
 * the machine's env file. A placeholder neither defines throws, naming where to add it.
 */
export function staticEnv(input: StaticEnvInput): string {
  const { role } = input;
  const env: Record<string, string> = {
    REGISTRY: input.registry,
    APP_MODE: input.context.mode,
    AGENT_TAG: input.release,
    AGENT_DIR: input.agentDir,
  };
  for (const service of role.services) env[tagVar(service.slug)] = input.release;
  const bindings = effectiveBindings(role);
  // The host block folds every co-hosted worker's env, so its placeholders show up even for a worker this deploy leaves off.
  const carried = new Set(role.services.map((service) => service.slug));
  const skippable = new Set(
    [...servicesByName.values()]
      .filter((service) => service.coHosted && !carried.has(service.slug))
      .flatMap((service) => [...composePlaceholders(service.slug), ...Object.keys(service.bindings ?? {})]),
  );
  const profiles = role.services.filter((service) => !service.coHosted || service.slug === role.role).map((service) => service.slug);
  for (const name of profiles.flatMap(composePlaceholders)) {
    if (INJECTED_VARS.has(name) || name.endsWith('_TAG') || name in env) continue;
    const binding = bindings[name];
    if (binding) {
      env[name] = binding.template.replace(BINDING_RE, (_match, target: string, prop: string) => bindingPart(input, binding, target, prop));
      continue;
    }
    const supply = input.suppliers[name];
    if (!supply) {
      if (skippable.has(name)) continue;
      throw new Error(
        `static env: '${role.role}' references \${${name}} in its compose blocks but no binding or env supplier defines it: add a binding in config/services.config.ts or a supplier in config/env-suppliers.config.ts.`,
      );
    }
    env[name] = supply(input.context);
  }
  return Object.entries(env)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');
}

/** The context every supplier is called with for an environment: its names, region and mode, and its public services' URLs. */
export function supplierContext(config: EngineConfig): EnvSupplierContext {
  const { naming, region } = deriveInfra(config);
  const urls = new Map(serviceEndpoints(config).map((endpoint) => [endpoint.slug as string, endpoint.url]));
  return {
    naming,
    region,
    mode: config.mode,
    serviceUrl: (slug) => {
      const url = urls.get(slug);
      if (!url) throw new Error(`Service '${slug}' has no public endpoint (internal-only?)`);
      return url;
    },
  };
}
