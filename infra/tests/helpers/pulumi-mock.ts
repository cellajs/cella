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
  /** Stack config overrides, namespaced (e.g. `{ 'bootstrap:computeDeferred': '2026-01-01T00:00:00Z' }`). */
  config?: Record<string, string>
}

/**
 * Installs Pulumi mocks for the current Node process. Must be called BEFORE
 * any module that imports `@pulumi/pulumi` is loaded; that is why this is
 * paired with `renderModule(importPath)`.
 */
export async function installPulumiMocks(opts: InstallOpts = {}): Promise<MockHarness> {
  // Stack/project must be set via env vars before @pulumi/pulumi is imported,
  // otherwise getStack() throws "Missing stack name".
  process.env.PULUMI_NODEJS_PROJECT = opts.project ?? 'infra'
  process.env.PULUMI_NODEJS_STACK = opts.stack ?? opts.mode ?? 'production'
  process.env.APP_MODE = opts.mode ?? opts.stack ?? 'production'

  // pulumi-context.ts requires the org id (to scope IAM lookups) and the project
  // id strictly from the environment, mirroring CI and the infra CLI. Provide
  // both so module rendering is deterministic.
  process.env.SCW_DEFAULT_PROJECT_ID = process.env.SCW_DEFAULT_PROJECT_ID ?? 'mock-project-id'
  process.env.SCW_DEFAULT_ORGANIZATION_ID = process.env.SCW_DEFAULT_ORGANIZATION_ID ?? 'mock-organization-id'

  // Pulumi reads stack config from PULUMI_CONFIG (JSON). Build it before import.
  if (opts.config) {
    process.env.PULUMI_CONFIG = JSON.stringify(opts.config)
  }

  // Engine modules read config at evaluation; load it (workspace fallback)
  // before any resource module is imported, exactly like index.ts does.
  const { loadEngineConfig } = await import('../../config/engine-config')
  await loadEngineConfig()

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
        // realistic values required by downstream resource construction.
        return {
          id: `${args.name}-id`,
          state: { ...args.inputs, id: `${args.name}-id` },
        }
      },
      call(args) {
        // IAM data sources used by pulumi-context.ts to derive identity ids. Return
        // deterministic stub ids so resource modules
        // that consume them render without talking to Scaleway.
        if (args.token.includes('getApplication')) {
          const name = String((args.inputs as { name?: string }).name ?? 'app')
          return { id: `${name}-id`, applicationId: `${name}-id`, name }
        }
        if (args.token.includes('getApiKey')) {
          return {
            id: 'mock-access-key',
            applicationId: 'mock-application-id',
            userId: 'mock-user-id',
            defaultProjectId: 'mock-project-id',
          }
        }
        // Secret Manager data sources used by pulumi-context.ts readVmReaderKey to
        // read the VM reader key. getVersion
        // returns the base64 JSON payload that readVmReaderKey decodes.
        if (args.token.includes('getSecret')) {
          const name = String((args.inputs as { name?: string }).name ?? 'secret')
          return { id: `fr-par/${name}-id`, name }
        }
        if (args.token.includes('getVersion')) {
          const payload = JSON.stringify({ accessKey: 'mock-vm-access', secretKey: 'mock-vm-secret' })
          return { data: Buffer.from(payload).toString('base64') }
        }
        return args.inputs as Record<string, unknown>
      },
    },
    opts.project ?? 'infra',
    opts.stack ?? opts.mode ?? 'production',
    false,
  )

  const byType = (prefix: string) => resources.filter((r) => r.type.startsWith(prefix))
  const oneOfType = (typeStr: string) => {
    const [match, ...rest] = resources.filter((r) => r.type === typeStr)
    if (!match || rest.length > 0) {
      throw new Error(`Expected exactly 1 resource of type ${typeStr}, got ${rest.length + (match ? 1 : 0)}`)
    }
    return match
  }

  return { pulumi, resources, byType, oneOfType }
}

/**
 * Wait for every captured resource's input Outputs to settle (so tests can
 * synchronously inspect string values). One microtask tick is enough because
 * the mock newResource returns its state synchronously.
 */
export async function flushPulumi(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}
