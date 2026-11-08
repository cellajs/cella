import { defineServices } from '../compose/infrastructure';
import { CRON_HOME_DATABASE } from '../lib/scaleway/db-privileges';

/**
 * Registry synthesized into Compose and deployment resources: an entry controls the service's machine, routing, profile
 * and release metadata. Run `pnpm --filter infra compose:generate` after editing. Each `port`,
 * `internalPort` and `pathPrefix` repeats `services` and `servicePaths` of the shared config, which the engine never
 * imports; `tests/unit/app-config-registry.test.ts` holds the two together.
 */
export const appServices = defineServices({
  backend: {
    image: '${REGISTRY}/backend:${BACKEND_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'backend',
    port: 4000,
    // API services answer /health with 204 and no body; the LB matches it exactly.
    healthExpectStatus: 204,
    startPeriod: '15s',
    // A new machine per release: it serves beside the old one once its agent reports it healthy, then the old one drains. The one-shot release companion applies migrations at the new machine's boot, so the app block does not migrate on its own.
    replacementStrategy: 'start-first',
    drainPolicy: 'requests',
    // The managed instance's admin user is no superuser, so it may not read `cron.database_name`: the migrate step is told pg_cron's database.
    release: { env: { SERVICE: 'migrate', PG_CRON_DATABASE: CRON_HOME_DATABASE } },
    primaryRollout: true,
    drainSeconds: 10,
    // Reached at https://<app-host>/api/... through an LB path-begin route; the backend self-mounts '/api', so the LB strips nothing.
    lbRoute: 'path',
    pathPrefix: '/api',
    // The internal listener (the CDC socket, the Yjs relay's routes): only the private ACL-guarded LB frontend forwards
    // to it, so in-network consumers dial a stable address that follows every switch and the public pool never can.
    internalPort: 4005,
    // Attachment uploads and presigned URLs are signed with the uploads key, which the deploy puts in this service's env file.
    s3Access: true,
    // Per-service machine type (required on every service).
    instanceType: { production: 'DEV1-S', staging: 'DEV1-S' },
    env: { APP_ORIGIN: '${APP_ORIGIN}' },
  },

  cdc: {
    image: '${REGISTRY}/cdc:${CDC_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'cdc',
    port: 4001,
    healthExpectStatus: 204,
    startPeriod: '10s',
    // CDC switches stop-first because it owns one PostgreSQL replication slot, and is reached only through the private network.
    replacementStrategy: 'stop-first',
    instanceType: 'DEV1-S',
    // singleVM folds it into the backend process, which then holds the same slot.
    coHosted: true,
    env: { BACKEND_INTERNAL_URL: '${BACKEND_INTERNAL_URL}', APP_ORIGIN: '${APP_ORIGIN}' },
    // The worker derives its socket's address from the backend's internal listener, dialed through the LB's private internal frontend: the address survives backend switches, the LB stays inside the private network the listener admits, and mark-down kills sessions so cdc re-dials.
    bindings: { BACKEND_INTERNAL_URL: 'http://@{backend.internalHost}:@{backend.internalPort}' },
  },

  yjs: {
    image: '${REGISTRY}/yjs:${YJS_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'yjs',
    port: 4002,
    healthExpectStatus: 204,
    startPeriod: '10s',
    replacementStrategy: 'start-first',
    // Sessions close during drain; WebSocket clients reconnect to the new machine and resync from durable CRDT state.
    drainPolicy: 'reconnect',
    drainSeconds: 5,
    // Reached at wss://<app-host>/yjs/... through an LB path-begin route; the yjs server accepts the unstripped prefix.
    lbRoute: 'path',
    pathPrefix: '/yjs',
    // The LB keeps these WebSocket connections open for up to an hour.
    lbWebsockets: true,
    instanceType: 'DEV1-S',
    // singleVM folds it into the backend process; the LB still routes to the host machine.
    coHosted: true,
    env: { APP_ORIGIN: '${APP_ORIGIN}', BACKEND_INTERNAL_URL: '${BACKEND_INTERNAL_URL}' },
    // Materialize calls go to the backend's internal listener through the LB's private internal frontend, never the public API.
    bindings: { BACKEND_INTERNAL_URL: 'http://@{backend.internalHost}:@{backend.internalPort}' },
  },

  mcp: {
    image: '${REGISTRY}/backend:${MCP_TAG:-latest}',
    port: 4003,
    healthExpectStatus: 204,
    startPeriod: '15s',
    replacementStrategy: 'start-first',
    drainPolicy: 'requests',
    drainSeconds: 10,
    // Reuses the backend image at the same SHA, so CI builds no separate mcp image.
    reusesImageOf: 'backend',
    // Reached at https://<app-host>/mcp/... through an LB path-begin route; the shared base app self-mounts '/mcp'.
    lbRoute: 'path',
    pathPrefix: '/mcp',
    instanceType: 'DEV1-S',
    // singleVM folds it into the backend process; the LB still routes to the host machine.
    coHosted: true,
    env: { SERVICE: 'mcp', APP_ORIGIN: '${APP_ORIGIN}' },
  },

  oauth: {
    image: '${REGISTRY}/backend:${OAUTH_TAG:-latest}',
    port: 4004,
    healthExpectStatus: 204,
    startPeriod: '15s',
    replacementStrategy: 'start-first',
    drainPolicy: 'requests',
    drainSeconds: 10,
    // Reuses the backend image at the same SHA, so CI builds no separate oauth image.
    reusesImageOf: 'backend',
    // The authorization server: reached at https://<app-host>/oauth/... through an LB path-begin route, same origin as the API so tokens and consent cookies share one issuer.
    lbRoute: 'path',
    pathPrefix: '/oauth',
    instanceType: 'DEV1-S',
    // singleVM folds it into the backend process; the LB still routes to the host machine.
    coHosted: true,
    env: { SERVICE: 'oauth', APP_ORIGIN: '${APP_ORIGIN}' },
  },

  jobs: {
    image: '${REGISTRY}/backend:${JOBS_TAG:-latest}',
    port: 4006,
    healthExpectStatus: 204,
    startPeriod: '15s',
    // One maintainer per deployment: pg-boss cron and queue supervision run in exactly one process, and nothing routes to it, so it never overlaps its predecessor.
    replacementStrategy: 'stop-first',
    // Reuses the backend image at the same SHA, so CI builds no separate jobs image.
    reusesImageOf: 'backend',
    instanceType: 'DEV1-S',
    // singleVM folds it into the backend process, which then runs cron and the queue workers itself.
    coHosted: true,
    env: { SERVICE: 'jobs', APP_ORIGIN: '${APP_ORIGIN}' },
  },

  frontend: {
    // Production-only reverse proxy in front of the SPA bucket, built per release from infra/caddy/Dockerfile; its runtime knobs are ORIGIN_HOST and CSP.
    image: '${REGISTRY}/frontend:${FRONTEND_TAG:-latest}',
    dockerfile: 'infra/caddy/Dockerfile',
    port: 80,
    startPeriod: '10s',
    replacementStrategy: 'start-first',
    drainPolicy: 'requests',
    // The app origin and the LB's fallback backend: anything no path route matches lands on the SPA proxy.
    lbRoute: 'default',
    // The SPA proxy reads no app secret, so it gets no standard env and no .env files.
    includeStandardEnv: false,
    includeEnvFile: false,
    // singleVM runs the Caddy container on the host machine, since a non-Node runtime cannot fold in-process; its LB pool follows the host's switch.
    placement: 'host',
    instanceType: 'DEV1-S',
    env: { FRONTEND_CSP: '${FRONTEND_CSP}', ORIGIN_HOST: '${ORIGIN_HOST}' },
  },
});

/** Env keys selecting a container's process identity: which service of the backend image to boot, which also picks its port. Never folded from a co-hosted worker onto the host, which runs them under its own identity. */
export const processIdentityEnv = ['SERVICE'] as const;
