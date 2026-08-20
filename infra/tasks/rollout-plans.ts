import type { ServiceName } from '../compose/compose';
import { engineConfig } from '../config/engine-config';
import { healthContract } from '../config/health.config';
import { coHostedServices, collocatedServices, effectiveStrategy, servicesByName } from '../lib/services';
import type { RolloutServicePlan } from './rollout';

function normalizeHealthUrl(explicit?: string): string | undefined {
  if (!explicit) return undefined;
  return explicit.endsWith(healthContract.path) ? explicit : `${explicit.replace(/\/$/, '')}${healthContract.path}`;
}

/**
 * Resolve one service's rollout plan from the service registry. Validates the
 * service exists and that a non-exclusive service has an LB route and health
 * URL (the only defined deploy path).
 */
export function planForService(serviceFlag: string, healthUrl?: string): RolloutServicePlan {
  const appConfig = engineConfig();
  const definition = servicesByName.get(serviceFlag as ServiceName);
  if (!definition) throw new Error(`Unknown service '${serviceFlag}'`);
  const service = definition.slug;

  // A singleVM host folding a stop-first worker replaces its VM within the provisioning update: the LB pool moves straight to [new] and there is no displaced generation left to drain.
  const exclusive =
    definition.replacementStrategy !== 'stop-first' &&
    effectiveStrategy(appConfig.services, appConfig.singleVM, definition) === 'stop-first';

  const plan: RolloutServicePlan = {
    service,
    strategy: definition.replacementStrategy,
    drainPolicy: definition.drainPolicy,
    drainSeconds: exclusive ? 0 : (definition.drainSeconds ?? 10),
    healthUrl: normalizeHealthUrl(healthUrl),
  };
  if (exclusive) plan.exclusive = true;

  if (definition.replacementStrategy !== 'stop-first') {
    if (!definition.lbRoute)
      throw new Error(`Service '${service}' is not exclusive and has no LB route; no deploy path is defined.`);
    if (!plan.healthUrl) throw new Error(`Service '${service}' has no health URL.`);
  }

  // LB pools that must follow this service's cutover because Pulumi ignores
  // their live server lists: co-hosted workers' and collocated containers'
  // pools (singleVM) and the service's own internal pool (internalRoute).
  const repointKeys: string[] = [];
  if (definition.primaryRollout && appConfig.singleVM) {
    repointKeys.push(
      ...[
        ...coHostedServices(appConfig.services, appConfig.singleVM),
        ...collocatedServices(appConfig.services, appConfig.singleVM),
      ]
        .filter((follower) => follower.lbRoute)
        .map((follower) => follower.slug),
    );
  }
  if (definition.internalRoute) repointKeys.push(`${service}-internal`);
  if (repointKeys.length > 0) plan.repointBackendKeys = repointKeys;

  return plan;
}
