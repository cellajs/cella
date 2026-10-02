import type { ServiceName } from '../compose/compose';
import { engineConfig } from '../config/engine-config';
import { healthContract } from '../config/health.config';
import { coHostedServices, collocatedServices, isSingletonHost, servicesByName } from '../lib/services';
import type { RolloutServicePlan } from './rollout';

function normalizeHealthUrl(explicit?: string): string | undefined {
  if (!explicit) return undefined;
  return explicit.endsWith(healthContract.path) ? explicit : `${explicit.replace(/\/$/, '')}${healthContract.path}`;
}

/**
 * Resolve one service's rollout plan from the service registry. Validates the
 * service exists and that a start-first service has an LB route and health
 * URL (the only defined deploy path).
 */
export function planForService(serviceFlag: string, healthUrl?: string): RolloutServicePlan {
  const appConfig = engineConfig();
  const definition = servicesByName.get(serviceFlag as ServiceName);
  if (!definition) throw new Error(`Unknown service '${serviceFlag}'`);
  const service = definition.slug;

  const plan: RolloutServicePlan = {
    service,
    strategy: definition.replacementStrategy,
    drainPolicy: definition.drainPolicy,
    drainSeconds: definition.drainSeconds ?? 10,
    healthUrl: normalizeHealthUrl(healthUrl),
  };
  // A singleVM host running a stop-first worker overlaps like any start-first service; its old VM is reaped right after promotion so the worker can move.
  if (isSingletonHost(appConfig.services, appConfig.singleVM, definition)) plan.singletonHost = true;

  if (definition.replacementStrategy !== 'stop-first') {
    if (!definition.lbRoute) throw new Error(`Service '${service}' is start-first and has no LB route; no deploy path is defined.`);
    if (!plan.healthUrl) throw new Error(`Service '${service}' has no health URL.`);
  }

  // LB pools that must follow this service's cutover because Pulumi ignores
  // their live server lists: co-hosted workers' and collocated containers'
  // pools (singleVM) and the service's own internal pool (internalPort).
  const repointKeys: string[] = [];
  if (definition.primaryRollout && appConfig.singleVM) {
    const followers = [...coHostedServices(appConfig.services, appConfig.singleVM), ...collocatedServices(appConfig.services, appConfig.singleVM)];
    repointKeys.push(...followers.filter((follower) => follower.lbRoute).map((follower) => follower.slug));
  }
  if (definition.internalPort !== undefined) repointKeys.push(`${service}-internal`);
  if (repointKeys.length > 0) plan.repointBackendKeys = repointKeys;

  return plan;
}
