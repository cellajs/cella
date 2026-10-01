import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as PulumiNS from '@pulumi/pulumi';
import { vi } from 'vitest';
import { type BootPlan, parseBootPlanJson } from '../../boot/src/plan';
import type { GenerationKeys } from '../../tasks/mint-generation-keys';

export interface CapturedResource {
  type: string;
  name: string;
  inputs: Record<string, unknown>;
  /** The provider-computed outputs the mock stubbed for this resource (see `newResource`). */
  outputs: Record<string, unknown>;
  provider?: string;
}

export interface MockHarness {
  pulumi: typeof PulumiNS;
  resources: CapturedResource[];
  /** Resources whose Pulumi type starts with this prefix (e.g. `scaleway:instance/`). */
  byType: (prefix: string) => CapturedResource[];
  /** Single resource of an exact type; throws if zero or many. */
  oneOfType: (typeStr: string) => CapturedResource;
  /** Waits until no new resource has registered for a run of event-loop turns: a VM registers only after its cloud-init's async output chain settles. */
  settle: () => Promise<void>;
}

export interface InstallOpts {
  project?: string;
  stack?: string;
  mode?: 'production' | 'staging' | 'development';
  /**
   * Marks compute deferred (`bootstrap:computeDeferred`), as a fresh provision does, so a module renders without the
   * pinned image tags pulumi-context.ts asserts for compute. For a test that renders no VM.
   */
  deferCompute?: boolean;
  /** Stack config overrides, namespaced (e.g. `{ 'infra:dbPublicEndpoint': 'true' }`). */
  config?: Record<string, string>;
}

/** Install Pulumi mocks for the current Node process. Must run BEFORE any module importing `@pulumi/pulumi` is loaded, which is why it pairs with `renderModule(importPath)`. */
export async function installPulumiMocks(opts: InstallOpts = {}): Promise<MockHarness> {
  // Stack and project must be set via env vars before @pulumi/pulumi is imported, or getStack() throws "Missing stack name".
  process.env.PULUMI_NODEJS_PROJECT = opts.project ?? 'infra';
  process.env.PULUMI_NODEJS_STACK = opts.stack ?? opts.mode ?? 'production';
  process.env.APP_MODE = opts.mode ?? opts.stack ?? 'production';

  // pulumi-context.ts requires the org id and project id strictly from the environment, as CI and the infra CLI do, so both are provided for deterministic rendering.
  process.env.SCW_DEFAULT_PROJECT_ID = process.env.SCW_DEFAULT_PROJECT_ID ?? 'mock-project-id';
  process.env.SCW_DEFAULT_ORGANIZATION_ID = process.env.SCW_DEFAULT_ORGANIZATION_ID ?? 'mock-organization-id';

  // Pulumi reads stack config from PULUMI_CONFIG (JSON). Build it before import.
  const config = { ...(opts.deferCompute ? { 'bootstrap:computeDeferred': 'test' } : {}), ...opts.config };
  if (Object.keys(config).length > 0) process.env.PULUMI_CONFIG = JSON.stringify(config);

  // Engine modules read config at evaluation, so load it before any resource module is imported, exactly like index.ts does.
  const { loadEngineConfig } = await import('../../config/engine-config');
  await loadEngineConfig();

  const pulumi = await import('@pulumi/pulumi');
  const resources: CapturedResource[] = [];
  let ipamAddresses = 0;

  pulumi.runtime.setMocks(
    {
      newResource(args) {
        // Echo inputs as outputs so chained pulumi.all() applies resolve with the values downstream resource construction needs.
        // Outputs only the provider computes get deterministic stubs: a managed database's CA certificate, a generated password, a reserved private IP, the LB's public address, the registry endpoint.
        const computedByType: Record<string, () => Record<string, unknown>> = {
          'scaleway:databases/instance:Instance': () => ({ certificate: 'mock-ca-certificate' }),
          'random:index/randomPassword:RandomPassword': () => ({ result: `random-${args.name}` }),
          'scaleway:ipam/ip:Ip': () => ({ address: `10.0.0.${++ipamAddresses}/24` }),
          'scaleway:loadbalancers/loadBalancer:LoadBalancer': () => ({ ipAddress: '203.0.113.10' }),
          'scaleway:registry/namespace:Namespace': () => ({ endpoint: `rg.nl-ams.scw.cloud/${String((args.inputs as { name?: string }).name)}` }),
        };
        const computed = computedByType[args.type]?.() ?? {};
        resources.push({
          type: args.type,
          name: args.name,
          inputs: args.inputs as Record<string, unknown>,
          outputs: computed,
          provider: args.provider,
        });
        return { id: `${args.name}-id`, state: { ...args.inputs, ...computed, id: `${args.name}-id` } };
      },
      call(args) {
        // IAM data sources pulumi-context.ts derives identity ids from; deterministic stub ids let consuming modules render without talking to Scaleway.
        if (args.token.includes('getApplication')) {
          const name = String((args.inputs as { name?: string }).name ?? 'app');
          return { id: `${name}-id`, applicationId: `${name}-id`, name };
        }
        if (args.token.includes('getApiKey')) {
          return { id: 'mock-access-key', applicationId: 'mock-application-id', userId: 'mock-user-id', defaultProjectId: 'mock-project-id' };
        }
        // Secret Manager data sources: deterministic stubs so a module reading a secret container or version renders without talking to Scaleway.
        if (args.token.includes('getSecret')) {
          const name = String((args.inputs as { name?: string }).name ?? 'secret');
          return { id: `fr-par/${name}-id`, name };
        }
        if (args.token.includes('getVersion')) {
          const payload = JSON.stringify({ accessKey: 'mock-vm-access', secretKey: 'mock-vm-secret' });
          return { data: Buffer.from(payload).toString('base64') };
        }
        return args.inputs as Record<string, unknown>;
      },
    },
    opts.project ?? 'infra',
    opts.stack ?? opts.mode ?? 'production',
    false,
  );

  const byType = (prefix: string) => resources.filter((r) => r.type.startsWith(prefix));
  const oneOfType = (typeStr: string) => {
    const [match, ...rest] = resources.filter((r) => r.type === typeStr);
    if (!match || rest.length > 0) {
      throw new Error(`Expected exactly 1 resource of type ${typeStr}, got ${rest.length + (match ? 1 : 0)}`);
    }
    return match;
  };
  const settle = async () => {
    let quiet = 0;
    for (let seen = resources.length; quiet < 25; quiet++) {
      await flushPulumi();
      if (resources.length !== seen) {
        seen = resources.length;
        quiet = 0;
      }
    }
  };

  return { pulumi, resources, byType, oneOfType, settle };
}

/** One event-loop turn: the mock's newResource answers synchronously, but a resource waiting on Outputs registers a turn later. */
async function flushPulumi(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** A secret input arrives wrapped in Pulumi's secret envelope; the plain value sits under `value`. */
export function unwrapSecret(input: unknown): unknown {
  return input && typeof input === 'object' && 'value' in input ? (input as { value: unknown }).value : input;
}

/** Hands the Pulumi program this deploy's minted keys, as tasks/deploy-run.ts does through INFRA_GENERATION_KEYS_FILE. */
export function writeGenerationKeys(keys: GenerationKeys): void {
  const file = join(mkdtempSync(join(tmpdir(), 'generation-keys-')), 'keys.json');
  writeFileSync(file, JSON.stringify(keys));
  vi.stubEnv('INFRA_GENERATION_KEYS_FILE', file);
}

/** The boot plan a cloud-init writes to `planPath`, read by the boot runner's own parser; throws when it writes none there. */
export function bootPlanIn(cloudInit: string, planPath: string): { plan: BootPlan; raw: Record<string, unknown> } {
  const json = cloudInit.split(`cat > ${planPath} <<'BOOT_PLAN_EOF'\n`)[1]?.split('\nBOOT_PLAN_EOF')[0] ?? '';
  return { plan: parseBootPlanJson(json, planPath), raw: JSON.parse(json) };
}
