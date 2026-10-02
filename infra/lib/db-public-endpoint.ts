import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RdbEndpoint, RdbInstance } from './scaleway/scaleway-rdb';
import { detectDbPublicEndpoint } from './stack/bootstrap-stack-state';
import { infraDir } from './utils/paths';
import { pollUntil } from './utils/retry';

/** Pulumi resource name of the managed PostgreSQL instance (resources/stores/postgres-managed.ts). */
export const DB_INSTANCE_RESOURCE = 'main-postgres';

/** URN of the managed PostgreSQL instance, for a refresh targeted at it alone. Accepts `organization/infra/<stack>` or a bare stack name. */
export function dbInstanceUrn(stack: string): string {
  return `urn:pulumi:${stack.split('/').pop()}::infra::scaleway:databases/instance:Instance::${DB_INSTANCE_RESOURCE}`;
}

/**
 * Gitignored per-environment stack config overlay carrying the DB-exposure keys, applied with `pulumi up --config-file`.
 * The committed `Pulumi.<env>.yaml` never records an open endpoint, so any normal deploy leaves the exposure config off.
 */
export function exposureOverlayPath(environment: string): string {
  return join(infraDir, `Pulumi.${environment}.exposure.yaml`);
}

/** True when the exposure overlay, else the committed stack config (stacks predating the overlay), turns the public endpoint on. */
export function dbExposureConfigured(environment: string, stackYaml?: string): boolean {
  const overlayPath = exposureOverlayPath(environment);
  return detectDbPublicEndpoint(existsSync(overlayPath) ? readFileSync(overlayPath, 'utf8') : stackYaml);
}

/** The instance's public endpoints: its load-balancer ones. The private-network endpoint every service connects through never qualifies. */
export function publicEndpoints(instance: Pick<RdbInstance, 'endpoints'>): RdbEndpoint[] {
  return (instance.endpoints ?? []).filter((endpoint) => endpoint.load_balancer != null && endpoint.private_network == null);
}

/** `host:port` of an endpoint, for messages. */
export function endpointAddress(endpoint: RdbEndpoint): string {
  return `${endpoint.hostname || endpoint.ip || endpoint.id}:${endpoint.port ?? '?'}`;
}

/** Whether a re-read instance shows a finished close: `ready` again, with no public endpoint left. */
export function closureVerdict(instance: RdbInstance): { closed: boolean; remaining: RdbEndpoint[] } {
  const remaining = publicEndpoints(instance);
  return { closed: instance.status === 'ready' && remaining.length === 0, remaining };
}

/** The RDB calls the close makes, injected so the order and the verification are testable without Scaleway. */
export interface CloseEndpointsEffects {
  getInstance(): Promise<RdbInstance>;
  deleteEndpoint(endpointId: string): Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  log(line: string): void;
}

/**
 * Delete every public endpoint of the instance, then re-read it until it is `ready` with none left; throws when it never gets there. Each delete
 * waits for a `ready` instance first, as Scaleway refuses an endpoint change while the instance is still configuring.
 */
export async function closePublicEndpoints(
  fx: CloseEndpointsEffects,
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<{ deleted: string[] }> {
  const poll = { attempts: opts.attempts ?? 60, intervalMs: opts.intervalMs ?? 5_000, sleep: fx.sleep };
  let last: RdbInstance | undefined;
  const waitFor = async (done: (instance: RdbInstance) => boolean): Promise<RdbInstance | undefined> =>
    pollUntil(async () => {
      last = await fx.getInstance();
      return done(last) ? last : undefined;
    }, poll);

  const deleted: string[] = [];
  const first = await waitFor((instance) => instance.status === 'ready');
  if (!first) throw new Error(`the database instance stays '${last?.status}', so no endpoint was deleted`);
  for (const endpoint of publicEndpoints(first)) {
    if (deleted.length > 0 && !(await waitFor((instance) => instance.status === 'ready'))) {
      throw new Error(`the database instance stays '${last?.status}' after deleting ${deleted.join(', ')}`);
    }
    fx.log(`deleting public endpoint ${endpointAddress(endpoint)} (${endpoint.id})`);
    await fx.deleteEndpoint(endpoint.id);
    deleted.push(endpointAddress(endpoint));
  }
  if (!(await waitFor((instance) => closureVerdict(instance).closed))) {
    const remaining = last ? publicEndpoints(last).map(endpointAddress) : [];
    throw new Error(`the database instance is '${last?.status}' with public endpoint(s) ${remaining.join(', ') || 'none'} left after the delete`);
  }
  return { deleted };
}
