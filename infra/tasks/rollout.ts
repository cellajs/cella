import type { ServiceName } from '../compose/compose';
import type { DrainPolicy, ReplacementStrategy } from '../compose/types';
import type { GenerationMetadata } from '../lib/generation-metadata';
import type { ServiceRollout } from '../lib/stack/control-store';
import { sequenceCutover } from './cutover';

/** One service's rollout inputs, resolved from the service registry. */
export interface RolloutServicePlan {
  service: ServiceName;
  strategy: ReplacementStrategy;
  drainPolicy?: DrainPolicy;
  drainSeconds: number;
  /** Public health URL; required for start-first services. */
  healthUrl?: string;
  /** Co-hosted worker slugs (singleVM) whose LB backends follow this VM. */
  repointBackendKeys?: string[];
  /** singleVM host whose effective strategy is stop-first: the provisioning update replaces the VM in place, so no old generation exists to overlap with or drain. */
  exclusive?: boolean;
}

/** Every effect the waved rollout performs, injected so wave sequencing is unit-testable. rollout-runtime.ts holds the Pulumi, control-object, LB, and health-polling implementation. */
export interface RolloutRuntime {
  /** Provision pending generations and reap displaced ones: ONE full-stack update converging on the control object's current pointers. The list only names the services a wave touches. */
  update(services: string[]): Promise<void>;
  /** The `computeGenerationMetadata` stack output. */
  readGenerations(): Promise<GenerationMetadata[]>;
  /** The `lbBackendIds` stack output (service slug to LB backend id). */
  readLbBackendIds(): Promise<Record<string, string>>;
  /** Current rollout entry for a service from the control object. */
  currentRollout(service: string): Promise<ServiceRollout | undefined>;
  /** Record deploy intent (pendingSha) for a service. */
  setPending(service: string, sha: string): Promise<void>;
  /** Promote a resolved generation to active for a service. */
  promote(service: string, gen: { id: string; sha: string }): Promise<void>;
  lbGetServers(backendId: string): Promise<string[]>;
  lbSetServers(backendId: string, ips: string[]): Promise<void>;
  /** Resolves true once `url` serves the expected release SHA. */
  healthGate(url: string, sha: string): Promise<boolean>;
  sleep(ms: number): Promise<void>;
  info(msg: string): void;
}

/**
 * Resolve the generation just provisioned for `sha`. Two generations share a sha when a redeploy keeps the sha but changes config, and the pending one is the id differing from the active.
 * A same-config redeploy collapses to the active id.
 */
export function resolvePendingGen(
  generations: GenerationMetadata[],
  service: string,
  sha: string,
  activeId?: string,
): GenerationMetadata {
  const candidates = generations.filter((item) => item.service === service && item.sha === sha);
  const pending = candidates.find((item) => item.genId !== activeId) ?? candidates[0];
  if (!pending) throw new Error(`Could not resolve pending generation metadata for ${service} @ ${sha}`);
  return pending;
}

/** Health-gate and cut over one provisioned service generation, then promote it. Requires the provisioning stack update to have run, and reads the pre-promotion active generation to build the LB overlap. */
export async function activateService(
  plan: RolloutServicePlan,
  sha: string,
  generations: GenerationMetadata[],
  backendIds: Record<string, string>,
  rt: RolloutRuntime,
): Promise<void> {
  const service = plan.service;
  const current = await rt.currentRollout(service);
  const target = resolvePendingGen(generations, service, sha, current?.active?.id);

  if (plan.strategy === 'stop-first') {
    // cdc has no LB and no overlap: the same stack update destroys the old generation, and the new worker reports healthy once it acquires the released slot.
    rt.info(`[deploy ${service}] exclusive replacement -> gen ${target.genId} (${sha})`);
    await rt.promote(service, { id: target.genId, sha });
    return;
  }

  if (!plan.healthUrl) throw new Error(`Service '${service}' has no health URL.`);
  const backendId = backendIds[service];
  if (!backendId) throw new Error(`Could not resolve LB backend id for ${service}`);

  // Serving generation before this deploy; empty on a first deploy or an exclusive host (whose old VM the provisioning update already destroyed), where the reconciler drives the LB straight to [new] once it is healthy.
  const activeRef = current?.active;
  const oldGen =
    activeRef && !plan.exclusive
      ? generations.find((item) => item.service === service && item.genId === activeRef.id)
      : undefined;
  const oldIps = oldGen ? [oldGen.privateIp] : [];

  rt.info(
    `[deploy ${service}] reconciling LB: old=[${oldIps.join(',') || '<none>'}] -> new=[${target.privateIp}] (gen ${target.genId})`,
  );
  const healthUrl = plan.healthUrl;
  const cutover = await sequenceCutover({
    service,
    strategy: 'start-first',
    drainPolicy: plan.drainPolicy,
    oldIps,
    newIps: [target.privateIp],
    drainSeconds: plan.drainSeconds,
    healthAfterExpand: true,
    getServers: () => rt.lbGetServers(backendId),
    setServers: (ips) => rt.lbSetServers(backendId, ips),
    healthGate: () => rt.healthGate(healthUrl, sha),
    sleep: rt.sleep,
    log: rt.info,
  });
  if (!cutover.ok) throw new Error(`Cutover failed for ${service}: ${cutover.aborted}`);

  // Repoint the LB pools following this service's VM (co-hosted workers' pools, its own internal pool). Pulumi ignores their live server lists, so cutover must remove reaped-generation IPs.
  for (const key of plan.repointBackendKeys ?? []) {
    const followerBackendId = backendIds[key];
    if (!followerBackendId) {
      rt.info(`[deploy ${service}] follower pool '${key}' has no LB backend id, skipping repoint`);
      continue;
    }
    rt.info(`[deploy ${service}] repointing follower pool '${key}' -> [${target.privateIp}]`);
    await rt.lbSetServers(followerBackendId, [target.privateIp]);
  }

  rt.info(`[deploy ${service}] promoting generation ${target.genId}`);
  await rt.promote(service, { id: target.genId, sha });
}

export interface WavedRolloutPlan {
  sha: string;
  /** Rolled alone in wave 1: consumers bake this service's promoted address. */
  primary?: RolloutServicePlan;
  /** Rolled together in wave 2: one provisioning update, concurrent cutovers. */
  rest: RolloutServicePlan[];
  /**
   * Skip the final reap update and leave displaced generations running after promotion; they are already detached from every LB pool.
   * A separate `reap` run destroys them off the deploy's critical path, and any later stack update also converges them.
   */
  skipFinalReap?: boolean;
}

/**
 * Two-wave rollout. Wave 1 deploys the primary service alone, which must promote first because consumers bake its promoted generation's address at plan time.
 * Wave 2 records pending intent for every remaining service, provisions all their generations in ONE stack update that also reaps the primary's displaced
 * generation, then health-gates and cuts each service over concurrently. A final update reaps every remaining displaced generation, or `skipFinalReap` defers
 * that to a separate reap run. Any cutover failure skips the reap because a displaced generation may still be serving.
 */
export async function runWavedRollout(plan: WavedRolloutPlan, rt: RolloutRuntime): Promise<void> {
  const { sha } = plan;

  // LB backend ids are only needed when a wave contains a start-first service; stop-first-only waves skip the stack-output read.
  const backendIdsFor = async (wave: RolloutServicePlan[]): Promise<Record<string, string>> =>
    wave.some((item) => item.strategy !== 'stop-first' || (item.repointBackendKeys?.length ?? 0) > 0)
      ? rt.readLbBackendIds()
      : {};

  if (plan.primary) {
    rt.info(`[rollout] wave 1: ${plan.primary.service}`);
    await rt.setPending(plan.primary.service, sha);
    await rt.update([plan.primary.service]);
    const generations = await rt.readGenerations();
    const backendIds = await backendIdsFor([plan.primary]);
    await activateService(plan.primary, sha, generations, backendIds, rt);
  }

  if (plan.rest.length > 0) {
    rt.info(`[rollout] wave 2: ${plan.rest.map((p) => p.service).join(', ')}`);
    for (const item of plan.rest) await rt.setPending(item.service, sha);
    await rt.update(plan.rest.map((item) => item.service));
    const generations = await rt.readGenerations();
    const backendIds = await backendIdsFor(plan.rest);
    const outcomes = await Promise.allSettled(
      plan.rest.map((item) => activateService(item, sha, generations, backendIds, rt)),
    );
    const failures = outcomes.flatMap((outcome, index) =>
      outcome.status === 'rejected'
        ? [`${plan.rest[index]?.service}: ${outcome.reason instanceof Error ? outcome.reason.message : outcome.reason}`]
        : [],
    );
    if (failures.length > 0) {
      // Promoted services keep serving the new release and failed ones keep their old generation behind the LB. Nothing is reaped, so re-running resumes idempotently.
      throw new Error(`Rollout failed for ${failures.length} service(s): ${failures.join('; ')}`);
    }
  }

  if (plan.skipFinalReap) {
    rt.info('[rollout] leaving displaced generations for a deferred reap run');
    return;
  }
  rt.info('[rollout] reaping displaced generations');
  await rt.update([...(plan.primary ? [plan.primary.service] : []), ...plan.rest.map((item) => item.service)]);
}
