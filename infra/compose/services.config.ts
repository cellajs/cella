import { defineServices } from './infrastructure'

/**
 * The fork-owned service registry — the single place a fork adds, removes, or
 * resizes a deployable service. Run `pnpm --filter infra compose:synth` after
 * editing to regenerate `infra/compose.gen.yml` (the file Docker reads).
 *
 * Data only: `infrastructure.ts` owns the deploy machinery (ingress proxy,
 * blue-green slot/migrator mechanism, healthcheck shape, shared env) and expands
 * each entry below into a full Compose block at synth time. Field docs come from
 * `AppServiceConfig` (hover any field). The backend is a normal `blue-green`
 * entry, so a fork controls its image, sizing, and env like any other service;
 * cella derives the two slots + one-shot migrator.
 *
 * Removing an entry removes the service everywhere it is derived: VM, LB
 * backend, DNS record, cert, deploy tag, and reconciler env.
 */
export default defineServices({
  backend: {
    image: '${REGISTRY}/backend:${BACKEND_TAG:-latest}',
    port: 4000,
    healthTimeoutSeconds: 240,
    startPeriod: '15s',
    // Zero-downtime: expanded into backend-blue/backend-green slots and a
    // one-shot `migrate` companion.
    rolloverStrategy: 'blue-green',
    runMigrate: true,
    drainSeconds: 10,
    lbRoute: 'default',
    // Resize the backend per mode here — no Pulumi config edit needed.
    instanceType: { production: 'DEV1-M', staging: 'DEV1-S' },
    env: {
      FRONTEND_URL: '${FRONTEND_URL}',
      BACKEND_URL: '${BACKEND_URL}',
      SYSTEM_ADMIN_IP_ALLOWLIST: '95.97.200.45',
    },
  },

  cdc: {
    image: '${REGISTRY}/cdc:${CDC_TAG:-latest}',
    port: 4001,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    rolloverStrategy: 'in-place',
    // cdc holds a single PostgreSQL replication slot, so it MUST stay in-place
    // (two slots would double-consume it). No lbRoute → internal-only, reached
    // over the private network rather than the public LB.
    env: {
      API_WS_URL: '${API_WS_URL}',
      BACKEND_URL: '${BACKEND_URL}',
      CDC_HEALTH_PORT: '4001',
    },
  },

  yjs: {
    image: '${REGISTRY}/yjs:${YJS_TAG:-latest}',
    port: 4002,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    rolloverStrategy: 'in-place',
    lbRoute: 'host',
    // WebSocket service — LB keeps connections open for up to an hour.
    lbWebsockets: true,
    // Only deployed when the app enables collaborative editing (appConfig.has.yjs).
    featureFlag: 'yjs',
    env: {
      BACKEND_URL: '${BACKEND_URL}',
      YJS_PORT: '4002',
    },
  },

  ai: {
    image: '${REGISTRY}/backend:${AI_TAG:-latest}',
    port: 4003,
    healthTimeoutSeconds: 240,
    startPeriod: '15s',
    rolloverStrategy: 'in-place',
    // Reuses the backend image at the same SHA; CI builds no separate ai image.
    reusesImageOf: 'backend',
    lbRoute: 'host',
    // Only deployed when the app enables the AI worker (appConfig.has.ai).
    featureFlag: 'ai',
    env: {
      MODE: 'ai-worker',
      PORT: '4003',
      FRONTEND_URL: '${FRONTEND_URL}',
      BACKEND_URL: '${BACKEND_URL}',
      AI_API_URL: '${AI_API_URL}',
      SYSTEM_ADMIN_IP_ALLOWLIST: '95.97.200.45',
    },
  },

  frontend: {
    // Production-only reverse-proxy in front of the SPA bucket. Image built per
    // release from infra/caddy/Dockerfile; runtime knobs are ORIGIN_HOST + CSP.
    image: '${REGISTRY}/frontend:${FRONTEND_TAG:-latest}',
    port: 80,
    healthTimeoutSeconds: 90,
    startPeriod: '10s',
    rolloverStrategy: 'in-place',
    lbRoute: 'host',
    // The SPA proxy reads no app secret — no standard env, no .env files.
    includeStandardEnv: false,
    includeEnvFile: false,
    env: {
      FRONTEND_CSP: '${FRONTEND_CSP}',
      ORIGIN_HOST: '${ORIGIN_HOST}',
    },
  },
})
