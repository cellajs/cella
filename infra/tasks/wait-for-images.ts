import { spawnSync } from 'node:child_process';
import type { ServiceName } from '../compose/compose';
import { imageServiceNames } from '../lib/services';
import { isMain } from '../lib/utils/is-main';
import { pollUntil } from '../lib/utils/retry';
import { parseServiceRows } from '../lib/utils/service-rows';
import { getFlag, getNumFlag, sleep } from './args';

/** Inspect a single image ref; resolves true if it exists. Injectable for tests. */
export type InspectFn = (imageRef: string) => Promise<boolean>;

/** Default inspector: `docker buildx imagetools inspect <ref>` (no shell). */
export const dockerInspect: InspectFn = async (imageRef) => {
  const { status } = spawnSync('docker', ['buildx', 'imagetools', 'inspect', imageRef], { stdio: 'ignore' });
  return status === 0;
};

export interface WaitOptions {
  registry: string;
  namespace: string;
  tag: string;
  inspect: InspectFn;
  /**
   * Override which image services to wait for. Defaults to `imageServiceNames`
   * (the canonical registry-derived list, which already excludes image-reuse
   * services like `ai`). The deploy workflow passes the feature-gated build set
   * here so an app with yjs/mcp disabled doesn't wait for an image that is never
   * built.
   */
  services?: ServiceName[];
  attempts?: number;
  intervalMs?: number;
  /** Optional fail-fast probe: true aborts the wait (a CI build job failed). */
  buildFailed?: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

/** Build the fully-qualified image reference for a service at the release tag. */
export function imageRef(registry: string, namespace: string, service: string, tag: string): string {
  return `${registry}/${namespace}/${service}:${tag}`;
}

/** Poll the registry until every image service's tag exists, or budgets run out. */
export async function waitForImages(opts: WaitOptions): Promise<{ ok: boolean; missing: string[] }> {
  const attempts = opts.attempts ?? 80;
  const intervalMs = opts.intervalMs ?? 15000;
  const sleepFn = opts.sleep ?? sleep;
  const log = opts.log ?? ((msg: string) => console.info(msg));

  const missing: string[] = [];
  for (const service of opts.services ?? imageServiceNames) {
    const ref = imageRef(opts.registry, opts.namespace, service, opts.tag);
    log(`Waiting for ${service}:${opts.tag}`);
    const ready = await pollUntil(
      async (attempt) => {
        if (opts.buildFailed && (await opts.buildFailed())) {
          throw new Error(`build job for an image failed; not waiting out the registry budget (${ref})`);
        }
        if (!(await opts.inspect(ref))) return undefined;
        log(`  ${service} ready after ${attempt} attempt(s)`);
        return true;
      },
      { attempts, intervalMs, sleep: sleepFn },
    );
    if (!ready) {
      log(`::error::${ref} never appeared in registry`);
      missing.push(ref);
    }
  }

  return { ok: missing.length === 0, missing };
}

/**
 * Fail-fast probe for CI: true when any build-images job of the CURRENT
 * workflow run concluded 'failure'. Needs GITHUB_TOKEN/REPOSITORY/RUN_ID;
 * returns a no-op probe outside CI. Errors count as "not failed" so a flaky
 * API read never aborts a wait that might still succeed.
 */
export function createCiBuildFailedProbe(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): (() => Promise<boolean>) | undefined {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  const runId = env.GITHUB_RUN_ID;
  if (!token || !repo || !runId) return undefined;
  return async () => {
    try {
      const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { jobs?: Array<{ name?: string; conclusion?: string | null }> };
      return (body.jobs ?? []).some((job) => job.name?.startsWith('build-') && job.conclusion === 'failure');
    } catch {
      return false;
    }
  };
}

interface CliArgs {
  registry: string;
  namespace: string;
  tag: string;
  services?: ServiceName[];
  attempts: number;
  intervalMs: number;
}

export function imageServicesFromBuildMatrix(raw: string): ServiceName[] {
  return parseServiceRows(raw, '--build-images-json', { required: ['service'] })
    .map((row) => row.service)
    .filter((service): service is ServiceName => (imageServiceNames as string[]).includes(service));
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const registry = getFlag(argv, '--registry');
  const namespace = getFlag(argv, '--ns');
  const tag = getFlag(argv, '--tag');
  if (!registry || !namespace || !tag) {
    throw new Error(
      'Usage: wait-for-images.ts --registry <host> --ns <namespace> --tag <git-sha> [--attempts N] [--interval ms] [--build-images-json <matrix>]',
    );
  }

  // The deploy workflow passes the feature-gated build matrix; restrict to known
  // image services so a reuse-only service (e.g. `ai`) can't sneak into the wait
  // loop. Omitted → wait for every image service (manual/local runs).
  const buildImagesRaw = getFlag(argv, '--build-images-json');
  const services = buildImagesRaw ? imageServicesFromBuildMatrix(buildImagesRaw) : undefined;

  return {
    registry,
    namespace,
    tag,
    services,
    attempts: getNumFlag(argv, '--attempts', 80),
    intervalMs: getNumFlag(argv, '--interval', 15000),
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const outcome = await waitForImages({
    registry: args.registry,
    namespace: args.namespace,
    tag: args.tag,
    services: args.services,
    attempts: args.attempts,
    intervalMs: args.intervalMs,
    inspect: dockerInspect,
    buildFailed: createCiBuildFailedProbe(),
  });

  if (!outcome.ok) throw new Error(`Images never appeared: ${outcome.missing.join(', ')}`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
