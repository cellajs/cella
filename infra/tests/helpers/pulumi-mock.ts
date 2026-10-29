import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as PulumiNS from '@pulumi/pulumi';
import { vi } from 'vitest';
import { type BootPlan, parseBootPlanJson } from '../../boot/src/plan';
import type { GenerationKeys } from '../../lib/scaleway/machine-keys';
import { installKeylessMocks, type RenderedResource, settleRender } from '../../lib/stack/keyless-render';

export type CapturedResource = RenderedResource;

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
  /** Render as `pulumi preview` does (`pulumi.runtime.isDryRun()` is true). */
  preview?: boolean;
  /** True for the name of an IAM application the `getApplication` lookup does not find. */
  absentApplication?: (name: string) => boolean;
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
  const resources = installKeylessMocks(pulumi, {
    project: opts.project ?? 'infra',
    stack: opts.stack ?? opts.mode ?? 'production',
    preview: opts.preview ?? false,
    absentApplication: opts.absentApplication,
  });

  const byType = (prefix: string) => resources.filter((r) => r.type.startsWith(prefix));
  const oneOfType = (typeStr: string) => {
    const [match, ...rest] = resources.filter((r) => r.type === typeStr);
    if (!match || rest.length > 0) {
      throw new Error(`Expected exactly 1 resource of type ${typeStr}, got ${rest.length + (match ? 1 : 0)}`);
    }
    return match;
  };
  const settle = () => settleRender(resources);
  return { pulumi, resources, byType, oneOfType, settle };
}

/** A secret input arrives wrapped in Pulumi's secret envelope; the plain value sits under `value`. */
export function unwrapSecret(input: unknown): unknown {
  return input && typeof input === 'object' && 'value' in input ? (input as { value: unknown }).value : input;
}

/** Hands the Pulumi program this deploy's machine keys, as tasks/deploy-run.ts does through INFRA_GENERATION_KEYS_FILE. */
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
