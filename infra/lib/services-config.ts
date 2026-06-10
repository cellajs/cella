/**
 * The editable service registry — the single place to add/remove a deployable
 * service or change its deploy knobs. Field meanings are documented on the
 * `ServiceDefinition` interface in `./services.ts`; every other infra surface
 * derives from this list (see that module's header).
 *
 * The `slug` doubles as the compose profile, so keep each slug aligned with a
 * `profiles:` key in compose.yml (which is hand-written, not generated).
 */
import type { ServiceDefinition } from './services.js'

export const services: readonly ServiceDefinition[] = [
  { slug: 'backend',  healthPort: 4000, healthTimeoutSeconds: 240, runMigrate: true,  rolloverStrategy: 'blue-green', drainSeconds: 10, lbRoute: 'default', instanceType: { production: 'DEV1-M', staging: 'DEV1-S' } },
  { slug: 'cdc',      healthPort: 4001, healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0 },
  { slug: 'yjs',      healthPort: 4002, healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0, featureFlag: 'yjs', lbRoute: 'host' },
  { slug: 'ai',       healthPort: 4003, healthTimeoutSeconds: 240, runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0, reusesImageOf: 'backend', featureFlag: 'ai', lbRoute: 'host' },
  { slug: 'frontend', healthPort: 80,   healthTimeoutSeconds: 90,  runMigrate: false, rolloverStrategy: 'in-place',   drainSeconds: 0, lbRoute: 'host' },
]
