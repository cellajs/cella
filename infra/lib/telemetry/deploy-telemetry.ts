import type { AttrValue } from './otlp'
import { createTelemetry, otlpConfigFromEnv, type Telemetry } from './emitter'
import { defineEvent, type EventDef, type Placeholders } from './events'

/**
 * Audit/error event catalog for the deploy pipeline. Names are stable: maple
 * alert rules and the black-box replay key on them. New events belong here
 * first (mirrors the EngineConfig rule: the catalog IS the contract).
 */
export const deployEvents = {
  started: defineEvent('deploy.started', 'deploy of {sha} to {mode} started'),
  stepCompleted: defineEvent('deploy.step.completed', 'step {step} completed in {duration_s}s'),
  stepFailed: defineEvent('deploy.step.failed', 'step {step} failed: {error}'),
  servicePending: defineEvent('deploy.service.pending', '{service} marked pending for {sha}'),
  servicePromoted: defineEvent('deploy.service.promoted', '{service} promoted to generation {gen_id}'),
  healthGatePassed: defineEvent('deploy.health_gate.passed', 'health gate passed: {url} serves {sha}'),
  healthGateFailed: defineEvent('deploy.health_gate.failed', 'health gate FAILED: {url} never served {sha}'),
  rolloutFailed: defineEvent('deploy.rollout.failed', 'rollout failed: {error}'),
  completed: defineEvent('deploy.completed', 'deploy of {sha} to {mode} succeeded'),
  failed: defineEvent('deploy.failed', 'deploy of {sha} to {mode} FAILED'),
} as const

/** Boot runner events (same stream, VM side). */
export const bootEvents = {
  started: defineEvent('boot.started', '{service} boot started for {sha}'),
  stepCompleted: defineEvent('boot.step.completed', '{service} boot step {step} completed in {duration_s}s'),
  stepFailed: defineEvent('boot.step.failed', '{service} boot step {step} FAILED: {error}'),
  completed: defineEvent('boot.completed', '{service} booted {sha} successfully'),
  failed: defineEvent('boot.failed', '{service} boot FAILED: {error}'),
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

/** Emit a cataloged event on the active deploy emitter; no-op when telemetry is off. */
export function emitDeployEvent<T extends string>(
  def: EventDef<T>,
  attrs: Record<Placeholders<T>, AttrValue> & Record<string, AttrValue>,
  opts: { severity?: 'info' | 'warn' | 'error'; body?: string } = {},
): void {
  active?.event(def, attrs, opts)
}

/** Deactivate (tests). */
export function resetDeployTelemetry(): void {
  active = undefined
}
