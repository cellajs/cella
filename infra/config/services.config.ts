import { defineServices } from '../compose/infrastructure';

/** App-owned registry synthesized into Compose and deployment resources: an entry controls the service's VM, routing, certificate, profile, and release metadata. Run `pnpm --filter infra compose:synth` after editing. */
export const appServices = defineServices({
  backend: {
    image: '${REGISTRY}/backend:${BACKEND_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'backend',
    port: 4000,
    // API services answer /health with 204 and no body; the LB matches it exactly.
    healthExpectStatus: 204,
    healthTimeoutSeconds: 240,
    startPeriod: '15s',
    // Immutable-node cutover: the new generation is health-gated, the LB overlaps both, then contracts. The one-shot release companion applies migrations at the new generation's boot, so the app block does not migrate on its own.
    replacementStrategy: 'start-first',
    drainPolicy: 'requests',
    release: { env: { MODE: 'migrate' }, appEnv: { RUN_MIGRATIONS_ON_BOOT: 'false' } },
    primaryRollout: true,
    drainSeconds: 10,
    // Reached at https://<app-host>/api/... through an LB path-begin route; the backend self-mounts '/api', so the LB strips nothing.
    lbRoute: 'path',
    pathPrefix: '/api',
    // Private ACL-guarded LB frontend so in-network consumers dial a stable address that follows every cutover.
    internalRoute: true,
    // Attachment uploads and presigned URLs are signed with the backend's own per-deploy service key.
    s3Access: true,
    // Per-service VM size (required on every service).
    instanceType: { production: 'DEV1-S', staging: 'DEV1-S' },
    env: {
      FRONTEND_URL: '${FRONTEND_URL}',
      BACKEND_URL: '${BACKEND_URL}',
    },
  },

  cdc: {
    image: '${REGISTRY}/cdc:${CDC_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'cdc',
    port: 4001,
    healthExpectStatus: 204,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    // CDC cuts over exclusively because it owns one PostgreSQL replication slot, and is reached only through the private network.
    replacementStrategy: 'stop-first',
    instanceType: 'DEV1-S',
    // singleVM folds it into the backend process, which then holds the same slot.
    coHosted: true,
    env: {
      API_WS_URL: '${API_WS_URL}',
      BACKEND_URL: '${BACKEND_URL}',
      CDC_HEALTH_PORT: '4001',
    },
    // A server-to-server WebSocket on /internal/cdc, dialed through the LB's private internal frontend: the address survives backend cutovers, the LB stays inside the VPC so the backend's source check passes, and mark-down kills sessions so cdc re-dials.
    bindings: {
      API_WS_URL: 'ws://@{backend.internalHost}:@{backend.internalPort}/internal/cdc',
    },
  },

  yjs: {
    image: '${REGISTRY}/yjs:${YJS_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'yjs',
    port: 4002,
    healthExpectStatus: 204,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    replacementStrategy: 'start-first',
    // Sessions close during drain; WebSocket clients reconnect to the new generation and resync from durable CRDT state.
    drainPolicy: 'reconnect',
    drainSeconds: 5,
    // Reached at wss://<app-host>/yjs/... through an LB path-begin route; the yjs server accepts the unstripped prefix.
    lbRoute: 'path',
    pathPrefix: '/yjs',
    // The LB keeps these WebSocket connections open for up to an hour.
    lbWebsockets: true,
    instanceType: 'DEV1-S',
    // singleVM folds it into the backend process; the LB still routes to the host VM.
    coHosted: true,
    env: {
      BACKEND_URL: '${BACKEND_URL}',
      YJS_PORT: '4002',
    },
  },

  mcp: {
    image: '${REGISTRY}/backend:${MCP_TAG:-latest}',
    port: 4003,
    healthExpectStatus: 204,
    healthTimeoutSeconds: 240,
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
    // singleVM folds it into the backend process; the LB still routes to the host VM.
    coHosted: true,
    env: {
      MODE: 'mcp',
      PORT: '4003',
      FRONTEND_URL: '${FRONTEND_URL}',
      BACKEND_URL: '${BACKEND_URL}',
      MCP_API_URL: '${MCP_API_URL}',
    },
    // The worker's own public URL, host-routed through the LB.
    bindings: {
      MCP_API_URL: '@{self.url}',
    },
  },

  frontend: {
    // Production-only reverse proxy in front of the SPA bucket, built per release from infra/caddy/Dockerfile; its runtime knobs are ORIGIN_HOST and CSP.
    image: '${REGISTRY}/frontend:${FRONTEND_TAG:-latest}',
    dockerfile: 'infra/caddy/Dockerfile',
    port: 80,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    replacementStrategy: 'start-first',
    drainPolicy: 'requests',
    // The app origin and the LB's fallback backend: anything no path route matches lands on the SPA proxy.
    lbRoute: 'default',
    // The SPA proxy reads no app secret, so it gets no standard env and no .env files.
    includeStandardEnv: false,
    includeEnvFile: false,
    // singleVM runs the Caddy container on the host VM, since a non-Node runtime cannot fold in-process; its LB pool follows the host cutover.
    placement: 'host',
    instanceType: 'DEV1-S',
    env: {
      FRONTEND_CSP: '${FRONTEND_CSP}',
      ORIGIN_HOST: '${ORIGIN_HOST}',
    },
  },
});

/** Env keys selecting a container's process identity: which in-process worker to boot (`MODE`) and which port it binds (`PORT`). Never folded from a co-hosted worker onto the host, which runs them under its own identity. */
export const processIdentityEnv = ['MODE', 'PORT'] as const;
