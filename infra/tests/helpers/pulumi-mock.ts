/**
 * Pulumi mock harness — lets us instantiate `infra/resources/*.ts` in a Vitest
 * process without actually talking to Scaleway.
 *
 * Pulumi's runtime stores per-process state (project name, stack name, config,
 * mocks). `installPulumiMocks()` wires all of that up + records every resource
 * the module under test creates. `renderModule()` dynamically imports a module
 * after the runtime is primed, then waits for its top-level outputs to settle.
 *
 * Limitations: cross-module state (e.g. compute.ts reading database.ts's output)
 * is captured because the mocks return the inputs as state, which Pulumi then
 * threads through `pulumi.all([...]).apply(...)`.
 */
import type * as PulumiNS from '@pulumi/pulumi'

export interface CapturedResource {
  type: string
  name: string
  inputs: Record<string, unknown>
  provider?: string
}

export interface MockHarness {
  pulumi: typeof PulumiNS
  resources: CapturedResource[]
  /** Resources whose Pulumi type starts with this prefix (e.g. `scaleway:instance/`). */
  byType: (prefix: string) => CapturedResource[]
  /** Single resource of an exact type; throws if zero or many. */
  oneOfType: (typeStr: string) => CapturedResource
}

export interface InstallOpts {
  project?: string
  stack?: string
  mode?: 'production' | 'staging' | 'development'
  /** Stack config overrides, namespaced (e.g. `{ 'bootstrap:applyInProgress': '2026-01-01T00:00:00Z' }`). */
  config?: Record<string, string>
}

/**
 * Installs Pulumi mocks for the current Node process. Must be called BEFORE
 * any module that imports `@pulumi/pulumi` is loaded — that's why this is
 * paired with `renderModule(importPath)`.
 */
export async function installPulumiMocks(opts: InstallOpts = {}): Promise<MockHarness> {
  // Stack/project must be set via env vars before @pulumi/pulumi is imported,
  // otherwise getStack() throws "Missing stack name".
  process.env.PULUMI_NODEJS_PROJECT = opts.project ?? 'infra'
  process.env.PULUMI_NODEJS_STACK = opts.stack ?? opts.mode ?? 'production'
  process.env.APP_MODE = opts.mode ?? opts.stack ?? 'production'

  // Pulumi reads stack config from PULUMI_CONFIG (JSON). Build it before import.
  if (opts.config) {
    process.env.PULUMI_CONFIG = JSON.stringify(opts.config)
  }

  const pulumi = await import('@pulumi/pulumi')
  const resources: CapturedResource[] = []

  pulumi.runtime.setMocks(
    {
      newResource(args) {
        resources.push({
          type: args.type,
          name: args.name,
          inputs: args.inputs as Record<string, unknown>,
          provider: args.provider,
        })
        // Echo inputs as outputs so chained pulumi.all() applies resolve with
        // real-looking values rather than `undefined`.
        return {
          id: `${args.name}-id`,
          state: { ...args.inputs, id: `${args.name}-id` },
        }
      },
      call(args) {
        return args.inputs as Record<string, unknown>
      },
    },
    opts.project ?? 'infra',
    opts.stack ?? opts.mode ?? 'production',
    false,
  )

  const byType = (prefix: string) => resources.filter((r) => r.type.startsWith(prefix))
  const oneOfType = (typeStr: string) => {
    const matches = resources.filter((r) => r.type === typeStr)
    if (matches.length !== 1) {
      throw new Error(`Expected exactly 1 resource of type ${typeStr}, got ${matches.length}`)
    }
    return matches[0]
  }

  return { pulumi, resources, byType, oneOfType }
}

/**
 * Wait for a Pulumi Output to settle and return its concrete value.
 * Useful when a test wants to assert the rendered shape of an `apply()` chain.
 */
export function awaitOutput<T>(output: PulumiNS.Output<T> | PulumiNS.Input<T>): Promise<T> {
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: Output#apply receives the resolved value
    ;(output as any).apply((v: T) => {
      resolve(v)
      return v
    })
  })
}

/**
 * Wait for every captured resource's input Outputs to settle (so tests can
 * synchronously inspect string values). One microtask tick is enough because
 * the mock newResource returns its state synchronously.
 */
export async function flushPulumi(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}
