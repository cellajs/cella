import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as PulumiNS from '@pulumi/pulumi';
import { vi } from 'vitest';
import { type BootPlan, parseBootPlanJson } from '../../boot/src/plan';
import { composeConfig } from '../../compose/compose';
import { BOOT_IMAGE_NAME, imageRepositoryOf } from '../../lib/deploy/release-archives';
import type { ReleasePlan } from '../../lib/deploy/release-plan';
import { servicesByName } from '../../lib/services';
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

/** The deploy key the program signs links with in a test: a key-shaped string, so a test can prove none reaches a machine. */
export const testDeployKey = { accessKey: 'SCWDEPLOYACCESSKEY00', secretKey: 'deploy-secret-key-of-the-test' };

/**
 * Hands the Pulumi program the plan of a release, as tasks/deploy-run.ts does through INFRA_RELEASE_PLAN_FILE, with the deploy key it signs
 * the links with: every archive and every service's env file. A stack without a control object makes its first generation at `latest`.
 */
export function writeReleasePlan(release = 'latest'): ReleasePlan {
  const names = [...new Set(Object.values(composeConfig.services).map((block) => imageRepositoryOf(block.image))), BOOT_IMAGE_NAME];
  const plan: ReleasePlan = {
    release,
    archives: Object.fromEntries(names.map((name) => [name, { key: `releases/${release}/images/${name}.tar`, sha256: 'a'.repeat(64) }])),
    machines: Object.fromEntries(
      [...servicesByName.keys()].map((slug) => [slug, { env: `env/${slug}.env`, bootAccount: `boot-diag/${slug}-20261103T120000Z-boot.log` }]),
    ),
  };
  const file = join(mkdtempSync(join(tmpdir(), 'release-plan-')), 'plan.json');
  writeFileSync(file, JSON.stringify(plan));
  vi.stubEnv('INFRA_RELEASE_PLAN_FILE', file);
  vi.stubEnv('SCW_ACCESS_KEY', testDeployKey.accessKey);
  vi.stubEnv('SCW_SECRET_KEY', testDeployKey.secretKey);
  return plan;
}

/** A file a `#cloud-config` writes, as its `write_files` entry holds it, or undefined when it writes none at `path`. */
export function cloudConfigFile(cloudConfig: string, path: string): string | undefined {
  const entry = cloudConfig.split('\n  - path: ').find((block) => block.startsWith(`${path}\n`));
  const content = entry?.split('    content: |\n')[1]?.split('\nruncmd:')[0];
  return content
    ?.split('\n')
    .map((line) => line.slice(6))
    .join('\n')
    .replace(/\n+$/, '');
}

/** The boot plan a cloud-init writes to `planPath`, read by the boot runner's own parser; throws when it writes none there. */
export function bootPlanIn(cloudInit: string, planPath: string): { plan: BootPlan; raw: Record<string, unknown> } {
  const json = cloudConfigFile(cloudInit, planPath) ?? '';
  return { plan: parseBootPlanJson(json, planPath), raw: JSON.parse(json) };
}
