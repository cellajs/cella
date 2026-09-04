import { readFileSync } from 'node:fs';
import { healthContract } from '../config/health.config';
import {
  type ComponentIssue,
  componentSeverity,
  formatComponentIssues,
  unhealthyComponents,
} from '../lib/health-components';
import { sleep as defaultSleep } from '../lib/utils/cli-output';
import { errorMessage } from '../lib/utils/errors';
import { isMain } from '../lib/utils/is-main';
import { pollUntil } from '../lib/utils/retry';
import { parseServiceRows } from '../lib/utils/service-rows';
import { getFlag } from './args';
import { isHealthy } from './wait-for-version';

/** Extract the hashed entry script src (e.g. /assets/index-abc123.js) from HTML. */
export function extractEntryAsset(html: string): string | undefined {
  const match = html.match(/src="([^"]*assets\/[^"]+\.js)"/);
  return match?.[1];
}

/** Response headers the frontend Caddy layer must inject, compared case-insensitively. A missing one means the Caddyfile regressed or the request bypassed Caddy. */
export const SECURITY_HEADERS = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy',
] as const;

/** True when the HTML references a hashed entry script (e.g. /assets/index-abc.js). */
export function hasHashedAsset(html: string): boolean {
  return extractEntryAsset(html) !== undefined;
}

/** True when the body looks like an HTML document (SPA fallback served index.html). */
export function isHtmlDocument(body: string): boolean {
  return /<html/i.test(body);
}

/** Header names from SECURITY_HEADERS that are absent from the response. */
export function missingSecurityHeaders(headers: Headers): string[] {
  return SECURITY_HEADERS.filter((h) => headers.get(h) === null);
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  body: string;
}

/** Performs a single HTTP GET. Injectable so the runner can be unit-tested. */
export type HttpGet = (url: string) => Promise<HttpResponse>;

/** One enabled rollout service as emitted by print-deploy-env's enabled_services_json. */
export interface SmokeService {
  service: string;
  health_url: string;
}

/**
 * Default GET using global fetch with no-cache headers and a timeout.
 * ws(s):// URLs are probed over plain HTTP on the same host, because a WebSocket worker's /health speaks HTTP and fetch rejects the ws scheme.
 */
export function createFetchGet(timeoutMs: number): HttpGet {
  return async (rawUrl) => {
    const url = rawUrl.replace(/^ws(s?):/, 'http$1:');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      return { status: res.status, ok: res.ok, headers: res.headers, body: await res.text() };
    } finally {
      clearTimeout(timer);
    }
  };
}

export interface SmokeOptions {
  /** Public URL of the default-route (browser) service; absent for a frontend-less registry, which skips the SPA and security-header checks. */
  defaultRouteUrl?: string;
  /** Public URL of the primary-rollout service, which serves the aggregate /health?depth=full and /openapi.json. */
  primaryUrl: string;
  expectedSha: string;
  /** Enabled rollout services; public services carry health_url, internal-only services have ''. */
  services?: readonly SmokeService[];
  /**
   * Hashed entry asset (e.g. /assets/index-abc123.js) from the freshly built local bundle.
   * When set, the bundle check requires the served index.html to reference this exact asset, otherwise any hashed asset passes.
   */
  expectedAsset?: string;
  get: HttpGet;
  log?: (msg: string) => void;
  /** Sleep between component-health retries. Injectable so tests run instantly. */
  sleep?: (ms: number) => Promise<void>;
  /** Number of times to poll /health?depth=full before failing (default {@link COMPONENTS_RETRY_ATTEMPTS}). */
  componentsRetryAttempts?: number;
  /** Delay between component-health polls in ms (default {@link COMPONENTS_RETRY_DELAY_MS}). */
  componentsRetryDelayMs?: number;
}

/**
 * Component-health retry budget. The exclusive cdc replacement frees its replication slot only at the final reap and the fresh worker's
 * WebSocket reconnect backs off up to 30s, so `cdc=unhealthy(worker_disconnected)` can persist for ~2 minutes after cutover. The 120s budget outlasts that.
 */
export const COMPONENTS_RETRY_ATTEMPTS = 15;
export const COMPONENTS_RETRY_DELAY_MS = 8_000;

/** `warn` surfaces as a CI annotation and keeps the run green; only `fail` makes the deploy red. */
export type SmokeStatus = 'ok' | 'warn' | 'fail';

export interface SmokeResult {
  name: string;
  status: SmokeStatus;
  detail?: string;
}

type Verdict = { status: SmokeStatus; detail?: string };

/** Pass/fail verdict for the binary checks. */
const verdict = (ok: boolean, detail: string): Verdict => ({ status: ok ? 'ok' : 'fail', detail });

/** Run all smoke checks, collecting every result (no short-circuit). */
export async function runSmoke(opts: SmokeOptions): Promise<SmokeResult[]> {
  const { defaultRouteUrl, primaryUrl, expectedSha, get } = opts;
  const sleep = opts.sleep ?? defaultSleep;
  const componentsRetryAttempts = opts.componentsRetryAttempts ?? COMPONENTS_RETRY_ATTEMPTS;
  const componentsRetryDelayMs = opts.componentsRetryDelayMs ?? COMPONENTS_RETRY_DELAY_MS;
  const results: SmokeResult[] = [];

  // The wrapper owns the try/catch and result collection, so no check can short-circuit the rest.
  const check = async (name: string, fn: () => Promise<Verdict>): Promise<void> => {
    try {
      const { status, detail } = await fn();
      results.push(status === 'ok' ? { name, status } : { name, status, detail });
    } catch (err) {
      results.push({ name, status: 'fail', detail: errorMessage(err) });
    }
  };

  // Require the exact local entry hash when available, otherwise any hashed entry asset. Skipped with the SPA and header checks when no default-route service exists.
  if (defaultRouteUrl)
    await check(
      opts.expectedAsset ? 'index.html references freshly built bundle' : 'index.html references hashed asset',
      async () => {
        const res = await get(`${defaultRouteUrl}/`);
        const matched = opts.expectedAsset ? res.body.includes(opts.expectedAsset) : hasHashedAsset(res.body);
        // Detail mirrors the branch that failed: a bad status, or a 200 whose HTML lacks the expected hashed entry asset.
        const detail = !res.ok
          ? `status=${res.status}`
          : opts.expectedAsset
            ? `served does not reference ${opts.expectedAsset}`
            : 'no hashed entry asset found in served index.html';
        return verdict(res.ok && matched, detail);
      },
    );

  await check('primary /openapi.json reachable', async () => {
    const res = await get(`${primaryUrl}/openapi.json`);
    return verdict(res.ok, `status=${res.status}`);
  });

  // Internal-only services have no health_url and are covered by the aggregate primary health.
  const publicServices = (opts.services ?? [{ service: 'primary', health_url: primaryUrl }]).filter(
    (service) => service.health_url,
  );
  for (const service of publicServices) {
    await check(`${service.service} reports deployed SHA`, async () => {
      const res = await get(`${service.health_url}${healthContract.path}`);
      const version = res.headers.get(healthContract.versionHeader) ?? undefined;
      return verdict(
        isHealthy({ status: res.status, version }, expectedSha),
        `served=${version ?? '<missing>'} expected=${expectedSha}`,
      );
    });
  }

  if (defaultRouteUrl)
    await check('SPA fallback returns HTML', async () => {
      const res = await get(`${defaultRouteUrl}/__smoke_${Date.now()}`);
      return verdict(res.ok && isHtmlDocument(res.body), `status=${res.status}`);
    });

  if (defaultRouteUrl)
    await check('security headers present', async () => {
      const res = await get(`${defaultRouteUrl}/`);
      const missing = missingSecurityHeaders(res.headers);
      return verdict(missing.length === 0, `missing: ${missing.join(', ')}`);
    });

  // Retry aggregate health across one worker reconnect interval after rollout: the first clean read passes and the
  // budget absorbs transient issues. What is still wrong when it runs out decides the verdict through
  // componentSeverity: only-degraded warns (slow, not down), anything unhealthy fails.
  await check('primary components healthy', async () => {
    let lastDetail = 'no response';
    let lastIssues: ComponentIssue[] | undefined;
    const healthy = await pollUntil(
      async () => {
        lastIssues = undefined;
        try {
          // The aggregate answers 503 with the same JSON body when a component is unhealthy, so the body is read regardless of status.
          const res = await get(`${primaryUrl}${healthContract.path}?depth=full`);
          const issues = unhealthyComponents(res.body);
          if (issues.length === 0 && res.ok) return true;
          lastIssues = issues;
          lastDetail = issues.length ? formatComponentIssues(issues) : `status=${res.status}`;
        } catch (err) {
          lastDetail = errorMessage(err);
        }
        return undefined;
      },
      { attempts: componentsRetryAttempts, intervalMs: componentsRetryDelayMs, sleep },
    );
    if (healthy === true) return { status: 'ok' };
    const status: SmokeStatus = lastIssues?.length && componentSeverity(lastIssues) === 'warn' ? 'warn' : 'fail';
    return { status, detail: lastDetail };
  });

  return results;
}

interface CliArgs {
  defaultRouteUrl?: string;
  primaryUrl: string;
  sha: string;
  services?: SmokeService[];
  /** Path to the freshly built local index.html for deriving the expected bundle hash. */
  dist?: string;
  timeoutMs: number;
}

export function parseServicesJson(raw: string): Array<SmokeService & { public_url?: string; lb_route?: string }> {
  return parseServiceRows(raw, '--services-json', {
    required: ['service', 'health_url'],
    optional: ['public_url', 'lb_route'],
  });
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const servicesRaw = getFlag(argv, '--services-json');
  const services = servicesRaw ? parseServicesJson(servicesRaw) : undefined;
  // Roles, not names (S9): the default-route service owns the browser checks, the --primary service owns the aggregate health and OpenAPI checks.
  // Without --primary, the first non-default-route service with a health URL stands in.
  const defaultRouteRow = services?.find((service) => service.lb_route === 'default');
  const primarySlug = getFlag(argv, '--primary');
  const primaryRow = primarySlug
    ? services?.find((service) => service.service === primarySlug)
    : services?.find((service) => service.health_url && service.lb_route !== 'default');
  const defaultRouteUrl = getFlag(argv, '--frontend') ?? defaultRouteRow?.public_url;
  const primaryUrl = getFlag(argv, '--backend') ?? primaryRow?.public_url;
  const sha = getFlag(argv, '--sha');
  if (!primaryUrl || !sha) {
    throw new Error(
      'Usage: smoke.ts [--frontend <url>] --backend <url> | --primary <slug> --sha <git-sha> [--services-json <json>] [--timeout ms]',
    );
  }
  const timeoutRaw = getFlag(argv, '--timeout');
  return {
    ...(defaultRouteUrl ? { defaultRouteUrl } : {}),
    primaryUrl,
    sha,
    services,
    dist: getFlag(argv, '--dist'),
    timeoutMs: timeoutRaw === undefined ? 10000 : Number(timeoutRaw),
  };
}

/**
 * Resolve the expected hashed entry asset from the freshly built local bundle.
 * A provided-but-unreadable --dist is a hard failure, so a wrong path or cwd cannot degrade the bundle check into a no-op.
 */
export function resolveExpectedAsset(dist: string | undefined): string | undefined {
  if (!dist) return undefined;
  let html: string;
  try {
    html = readFileSync(dist, 'utf-8');
  } catch (err) {
    throw new Error(
      `Could not read ${dist}: ${errorMessage(err)}. The local bundle is required to verify the served bundle; check the --dist path and the working directory.`,
    );
  }
  const expectedAsset = extractEntryAsset(html);
  if (expectedAsset) console.info(`Expecting served index.html to reference: ${expectedAsset}`);
  else
    console.warn(`::warning::No hashed entry asset found in ${dist}; falling back to "references some hashed asset"`);
  return expectedAsset;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const expectedAsset = resolveExpectedAsset(args.dist);
  const results = await runSmoke({
    defaultRouteUrl: args.defaultRouteUrl,
    primaryUrl: args.primaryUrl,
    expectedSha: args.sha,
    services: args.services,
    expectedAsset,
    get: createFetchGet(args.timeoutMs),
  });

  for (const r of results) {
    const line = `${r.name}${r.detail ? `: ${r.detail}` : ''}`;
    if (r.status === 'ok') console.info(`✓ ${r.name}`);
    else if (r.status === 'warn') console.warn(`::warning::${line}`);
    else console.error(`::error::${line}`);
  }

  // GitHub has no yellow job outcome: a warning is a green job carrying an annotation, so only failures throw.
  const warned = results.filter((r) => r.status === 'warn');
  if (warned.length > 0)
    console.warn(`${warned.length} smoke check(s) warned (degraded components); deploy is not blocked`);
  const failed = results.filter((r) => r.status === 'fail');
  if (failed.length > 0) throw new Error(`${failed.length} smoke check(s) failed`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
