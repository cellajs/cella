import { defineServices } from '../compose/infrastructure'

/**
 * Fork-owned registry synthesized into Compose and deployment resources.
 * Entry presence controls the service's VM, routing, certificate, profile, and release
 * metadata. Run `pnpm --filter infra compose:synth` after editing.
 */
export const appServices = defineServices({
  backend: {
    image: '${REGISTRY}/backend:${BACKEND_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'backend',
    port: 4000,
    healthTimeoutSeconds: 240,
    startPeriod: '15s',
    // Immutable-node cutover: a new generation is health-gated, the LB overlaps
    // both generations, then contracts to the new one. The one-shot `migrate`
    // companion runs at the new generation's boot (expand-before-cutover).
    replacementStrategy: 'lb-overlap',
    drainPolicy: 'requests',
    runMigrate: true,
    primaryRollout: true,
    drainSeconds: 10,
    // Same-origin: reached at https://<app-host>/api/... via an LB path-begin
    // route; the backend self-mounts '/api' (no LB stripping).
    lbRoute: 'path',
    lbPathBegin: '/api',
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
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    // CDC must cut over exclusively because it owns one PostgreSQL replication slot.
    // It is internal-only and reached through the private network.
    replacementStrategy: 'exclusive',
    instanceType: 'DEV1-S',
    // singleVM: fold into the backend process in-process (holds the same slot).
    coHosted: true,
    env: {
      API_WS_URL: '${API_WS_URL}',
      BACKEND_URL: '${BACKEND_URL}',
      CDC_HEALTH_PORT: '4001',
    },
    // cdc → backend is a server-to-server WebSocket on the internal /internal/cdc
    // path, straight to the backend VM over the private network (the backend
    // rejects sources outside loopback / the VPC, so it can't go via the LB).
    bindings: {
      API_WS_URL: 'ws://@{backend.privateIp}:@{backend.port}/internal/cdc',
    },
  },

  yjs: {
    image: '${REGISTRY}/yjs:${YJS_TAG:-latest}',
    dockerfile: 'Dockerfile',
    target: 'yjs',
    port: 4002,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    replacementStrategy: 'lb-overlap',
    // WebSocket clients reconnect to the new generation and resync from durable
    // CRDT state while sessions close during drain.
    drainPolicy: 'reconnect',
    drainSeconds: 5,
    // Same-origin: reached at wss://<app-host>/yjs/... via an LB path-begin
    // route; the yjs server accepts the unstripped prefix.
    lbRoute: 'path',
    lbPathBegin: '/yjs',
    // WebSocket service: LB keeps connections open for up to an hour.
    lbWebsockets: true,
    // Only deployed when appConfig.services.yjs.enabled is true.
    instanceType: 'DEV1-S',
    // singleVM: fold into the backend process (LB still routes to the host VM).
    coHosted: true,
    env: {
      BACKEND_URL: '${BACKEND_URL}',
      YJS_PORT: '4002',
    },
  },

  mcp: {
    image: '${REGISTRY}/backend:${MCP_TAG:-latest}',
    port: 4003,
    healthTimeoutSeconds: 240,
    startPeriod: '15s',
    replacementStrategy: 'lb-overlap',
    drainPolicy: 'requests',
    drainSeconds: 10,
    // Reuses the backend image at the same SHA; CI builds no separate mcp image.
    reusesImageOf: 'backend',
    // Same-origin: reached at https://<app-host>/mcp/... via an LB path-begin
    // route; the shared base app self-mounts '/mcp'.
    lbRoute: 'path',
    lbPathBegin: '/mcp',
    // Only deployed when appConfig.services.mcp.enabled is true.
    instanceType: 'DEV1-S',
    // singleVM: fold into the backend process (LB still routes to the host VM).
    coHosted: true,
    env: {
      MODE: 'mcp-worker',
      PORT: '4003',
      FRONTEND_URL: '${FRONTEND_URL}',
      BACKEND_URL: '${BACKEND_URL}',
      MCP_API_URL: '${MCP_API_URL}',
    },
    // The worker's own public URL (host-routed through the LB).
    bindings: {
      MCP_API_URL: '@{self.url}',
    },
  },

  frontend: {
    // Production-only reverse-proxy in front of the SPA bucket. Image built per
    // release from infra/caddy/Dockerfile; runtime knobs are ORIGIN_HOST + CSP.
    image: '${REGISTRY}/frontend:${FRONTEND_TAG:-latest}',
    dockerfile: 'infra/caddy/Dockerfile',
    port: 80,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    replacementStrategy: 'lb-overlap',
    drainPolicy: 'requests',
    // The app origin: the LB's fallback backend. Everything no path route
    // matches (/api, /yjs, /mcp) lands on the SPA proxy.
    lbRoute: 'default',
    // The SPA proxy reads no app secret: no standard env, no .env files.
    includeStandardEnv: false,
    includeEnvFile: false,
    instanceType: 'DEV1-S',
    env: {
      FRONTEND_CSP: '${FRONTEND_CSP}',
      ORIGIN_HOST: '${ORIGIN_HOST}',
    },
  },
});
