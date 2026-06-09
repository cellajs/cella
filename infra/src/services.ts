/**
 * Canonical service registry — the single source of truth for the set of
 * deployable services and their per-service deploy knobs.
 *
 * Every other infra surface derives its service list from here instead of
 * re-declaring `['backend','cdc','yjs','ai','frontend']`:
 *   - modules/deploy-tags.ts   — one S3 tag object per service
 *   - reconciler/index.ts      — per-VM reconciler env (compose profile, health
 *                                port, rollover strategy, …)
 *   - tasks/wait-for-images.ts — which images CI waits for in the registry
 *   - src/runtime-secrets.ts   — which services a runtime secret is exposed to
 *
 * compose.yml still lists the profiles by hand (it is not generated); keep the
 * `composeProfile` values aligned with its `profiles:` keys.
 */
export type ServiceName = 'backend' | 'cdc' | 'yjs' | 'ai' | 'frontend'

export interface ServiceDefinition {
  name: ServiceName
  /**
   * Service whose image this one reuses. When set, CI builds/pushes NO image
   * for this service and `wait-for-images` does not wait for one — the VM pulls
   * the reused service's image at the same SHA. `ai` reuses the backend image.
   */
  reusesImageOf?: ServiceName
  /** Compose profile that brings up this service (mirrors compose.yml `profiles:`). */
  composeProfile: string
  /** Host/exposed port the reconciler probes for the identity health check. */
  healthPort: number
  /**
   * Seconds the reconciler waits for the new container to answer /health with
   * the desired X-App-Version before rolling back. The backend image is heavy
   * (it runs warmup on boot), so it needs a larger budget than the lightweight
   * services — too tight a window causes a rollback loop. ai reuses the backend
   * image, so it gets the same budget.
   */
  healthTimeoutSeconds: number
  /**
   * When true, the reconciler runs the one-shot `migrate` compose service to
   * apply schema migrations BEFORE rolling this service's app container
   * (expand-before-rollover). Only the backend owns the schema; ai reuses the
   * backend image but must NOT migrate (it is a worker that waits for the API).
   */
  runMigrate: boolean
  /**
   * How the reconciler rolls this service:
   *  - 'in-place'   — recreate the single app container behind the ingress.
   *  - 'blue-green' — run two named slots (`<svc>-blue` / `<svc>-green`) and
   *    flip the ingress upstream between them. The idle slot is brought up on
   *    the new tag and identity-gated BEFORE any traffic moves, so a bad
   *    release never replaces the serving container.
   * Only the backend opts into blue-green today (stateless + critical, and it
   * owns migrations); the lighter services keep the simpler in-place roll. cdc
   * is a singleton (one replication slot) and could never run two slots.
   * See infra/INFRA_ARCHITECTURE.md (Zero-downtime deploys).
   */
  rolloverStrategy: 'in-place' | 'blue-green'
  /**
   * For blue-green services only: seconds the old slot keeps serving in-flight
   * requests AFTER the ingress has flipped to the new slot, before the old slot
   * is stopped. Lets long-ish requests drain on the retired slot. 0 for the
   * in-place services (unused).
   */
  drainSeconds: number
}

export const services: readonly ServiceDefinition[] = [
  { name: 'backend',  composeProfile: 'backend',  healthPort: 4000, healthTimeoutSeconds: 240, runMigrate: true,  rolloverStrategy: 'blue-green', drainSeconds: 10 },
  { name: 'cdc',      composeProfile: 'cdc',      healthPort: 4001, healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0 },
  { name: 'yjs',      composeProfile: 'yjs',      healthPort: 4002, healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0 },
  { name: 'ai',       composeProfile: 'ai',       healthPort: 4003, healthTimeoutSeconds: 240, runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0, reusesImageOf: 'backend' },
  { name: 'frontend', composeProfile: 'frontend', healthPort: 80,   healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0 },
]

/** Ordered service names — the canonical list every consumer derives from. */
export const serviceNames = services.map((s) => s.name)

/** Lookup a service definition by name. */
export const servicesByName = new Map<ServiceName, ServiceDefinition>(services.map((s) => [s.name, s]))

/** Services that build & push their own image (exclude image-reuse services). */
export const imageServiceNames = services.filter((s) => !s.reusesImageOf).map((s) => s.name)
