import { appServices } from '../config/services.config';
import { assembleCompose } from './infrastructure'
import type { ServiceMeta } from './types'

/** The full Compose model: machinery + app services. Emitted by `synth.ts`. */
export const composeConfig = assembleCompose(appServices)

/**
 * The literal service-name union, derived from the fork's service registry
 * (including the backend, a normal `blue-green` entry).
 */
export type ServiceName = keyof typeof appServices

/** Ordered logical-service metadata, derived from the assembled Compose model. */
export const services: readonly ServiceMeta[] = Object.values(composeConfig.services)
  .map((svc) => svc['x-service'])
  .filter((meta): meta is ServiceMeta => meta !== undefined)

/** Ordered service slugs: the canonical list every consumer derives from.
 *  `ServiceMeta.slug` is a plain string on the Compose model, but every
 *  `x-service` block is authored from an `appServices` key, so the assertion
 *  restores the literal union the model cannot carry. */
export const serviceNames = services.map((s) => s.slug) as readonly ServiceName[]
