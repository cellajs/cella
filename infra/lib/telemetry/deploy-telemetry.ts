import type { AttrValue } from './otlp'
import { createTelemetry, otlpConfigFromEnv, type Telemetry } from './emitter'

/**
 * Audit/error event catalog for the deploy pipeline. Names are stable: maple
 * alert rules and the black-box replay key on them. New events belong here
 * first (mirrors the EngineConfig rule: the catalog IS the contract).
 */
export const deployEvents = {
  started: 'deploy.started',
  stepCompleted: 'deploy.step.completed',
  stepFailed: 'deploy.step.failed',
  servicePending: 'deploy.service.pending',
  servicePromoted: 'deploy.service.promoted',
  healthGatePassed: 'deploy.health_gate.passed',
  healthGateFailed: 'deploy.health_gate.failed',
  rolloutFailed: 'deploy.rollout.failed',
  completed: 'deploy.completed',
  failed: 'deploy.failed',
} as const

/** Boot agent event names (same stream, VM side). */
export const bootEvents = {
  started: 'boot.started',
  stepCompleted: 'boot.step.completed',
  completed: 'boot.completed',
  failed: 'boot.failed',
} as const

// One emitter per deploy process. rollout-runtime emits through the accessor
// without plumbing the instance through every seam; absent init (unit tests,
// disabled telemetry) every call is a safe no-op.
let active: Telemetry | undefined

export interface DeployTelemetryInit {
  mode: string
  sha: string
  /** Extra resource attributes (e.g. the app slug). */
  resource?: Record<string, AttrValue>
  endpoint?: string
  headers?: Record<string, string>
  onError?: (message: string) => void
}

/** Create and activate the deploy-run emitter. Joins a CI TRACEPARENT when present. */
export function initDeployTelemetry(init: DeployTelemetryInit): Telemetry {
  const fromEnv = otlpConfigFromEnv()
  active = createTelemetry({
    resource: {
      'service.name': 'infra-deploy',
      'deployment.environment.name': init.mode,
      'vcs.ref.head.revision': init.sha,
      ...(init.resource ?? {}),
    },
    endpoint: init.endpoint ?? fromEnv?.endpoint,
    headers: init.headers ?? fromEnv?.headers,
    traceparent: process.env.TRACEPARENT,
    onError: init.onError,
  })
  return active
}

/** The active deploy emitter, if any (undefined outside a deploy run). */
export function deployTelemetry(): Telemetry | undefined {
  return active
}

/** Emit an event on the active deploy emitter; no-op when telemetry is off. */
export function emitDeployEvent(
  name: string,
  attrs: Record<string, AttrValue> = {},
  opts: { severity?: 'info' | 'warn' | 'error'; body?: string } = {},
): void {
  active?.event(name, attrs, opts)
}

/** Deactivate (tests). */
export function resetDeployTelemetry(): void {
  active = undefined
}
