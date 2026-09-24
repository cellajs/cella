import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import {
  classifyPrincipal,
  describeKey,
  formatKeyLine,
  hoursUntilExpiry,
  type KeyDescription,
  type PrincipalRole,
  resolveOperatorIdentity,
} from '../lib/scaleway/operator-identity';
import { principalNames } from '../lib/scaleway/principals';
import { resolveProjectId } from '../lib/scaleway/provider-env';
import { detectComputeDeferred, pickStackShort, type StackState } from '../lib/stack/bootstrap-stack-state';
import {
  type ControlState,
  controlKey,
  type LockInfo,
  lockKey,
  makeControlClient,
  peekLock,
  readControlState,
  stateBucket,
} from '../lib/stack/control-store';
import { loadStackContext } from '../lib/stack/stack-context';
import { buildStatusReport } from '../lib/status/registry';
import type { CheckStatus, ProbeSession, ScalewayFacts, StatusReport } from '../lib/status/types';
import { checkMark, crossMark, DIVIDER, pc, warningMark, withSpinner } from '../lib/utils/cli-output';
import { loadBaseEnvFiles } from '../lib/utils/env-files';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';

/** Everything the report needs about the target stack, from the menu or standalone. */
export interface StatusContext {
  mode: string;
  appConfig: EngineConfig;
  stackState: StackState;
  stackYaml?: string;
  projectId?: string;
}

/** An S3-style NoSuchBucket, distinct from a missing control object (bucket exists). */
function isNoSuchBucket(err: unknown): boolean {
  const e = err as { name?: string };
  return e?.name === 'NoSuchBucket';
}

/**
 * Build the probe session the providers draw on: resolved stack context, the
 * key to probe with (the admin application key, else the key the process was
 * started with), and one memoized best-effort control-store read shared by
 * the state and live providers.
 */
export function buildSession(ctx: StatusContext): ProbeSession {
  const identity = resolveOperatorIdentity();
  const aws =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKey: process.env.AWS_ACCESS_KEY_ID, secretKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined;
  const key = identity.admin ?? identity.ambient ?? aws;
  const accessKey = key?.accessKey;
  const secretKey = key?.secretKey;
  const scalewayKeyAvailable = Boolean(accessKey && secretKey);
  let hasDomain = false;
  try {
    hasDomain = deriveInfra(ctx.appConfig).hasDomain;
  } catch {
    hasDomain = Boolean(ctx.appConfig.domain && ctx.appConfig.domain !== 'localhost');
  }

  let memo: Promise<ScalewayFacts> | undefined;
  const scalewayFacts = (): Promise<ScalewayFacts> => {
    memo ??= (async () => {
      const out: ScalewayFacts = {};
      if (!scalewayKeyAvailable || !accessKey || !secretKey) return out;
      try {
        const s3 = await makeControlClient(ctx.appConfig.s3.region, accessKey, secretKey);
        const bucket = stateBucket(ctx.appConfig.slug);
        try {
          const { state } = await readControlState(s3, bucket, controlKey(ctx.mode));
          out.stateBucketExists = true;
          out.rollout = Object.entries(state.rollout).map(([slug, r]) => ({
            slug,
            activeSha: r.active?.sha,
            pendingSha: r.pendingSha,
          }));
        } catch (err) {
          if (isNoSuchBucket(err)) out.stateBucketExists = false;
        }
        if (out.stateBucketExists) {
          try {
            const info = await peekLock(s3, bucket, lockKey(ctx.mode));
            out.lock = info
              ? {
                  held: true,
                  owner: info.owner,
                  operation: info.operation,
                  acquiredAt: info.acquiredAt,
                  expiresAt: info.expiresAt,
                  stale: Date.parse(info.expiresAt) < Date.now(),
                }
              : { held: false };
          } catch {
            // Leave lock undefined (reported as unknown).
          }
        }
      } catch {
        // Leave every field undefined (reported as unknown).
      }
      return out;
    })();
    return memo;
  };

  return {
    mode: ctx.mode,
    appConfig: ctx.appConfig,
    stackState: ctx.stackState,
    stackYaml: ctx.stackYaml,
    projectId: ctx.projectId ?? resolveProjectId(),
    scalewayKeyAvailable,
    accessKey,
    secretKey,
    hasDomain,
    computeDeferredSince: detectComputeDeferred(ctx.stackYaml),
    scalewayFacts,
  };
}

/** Build the full report (provider registry + wall-clock stamp). */
export async function buildReport(ctx: StatusContext): Promise<StatusReport> {
  return buildStatusReport(buildSession(ctx));
}

const MARKS: Record<CheckStatus, string> = {
  ok: checkMark,
  warn: warningMark,
  missing: crossMark,
  error: crossMark,
  unknown: pc.dim('?'),
};

export function formatReport(report: StatusReport): string {
  const lines: string[] = [];
  const s = report.summary;
  lines.push(pc.dim(DIVIDER));
  lines.push(`${pc.bold('infra status')}  ${pc.cyan(report.mode)}  ${pc.dim(`(${report.stackState})`)}`);
  lines.push(pc.dim(`${s.ok} ok · ${s.warn} warn · ${s.missing} missing · ${s.error} error · ${s.unknown} unknown`));
  lines.push(pc.dim(DIVIDER));
  // Pad the raw title to the widest, then colour, so values align in a column.
  const width = report.checks.reduce((max, check) => Math.max(max, check.title.length), 0);
  for (const check of report.checks) {
    const label = pc.bold(pc.gray(check.title.padEnd(width)));
    lines.push(`${MARKS[check.status]} ${label}  ${check.detail}`);
  }
  if (report.nextAction) {
    lines.push(pc.dim(DIVIDER));
    lines.push(`${pc.bold('Next:')} ${report.nextAction.description}`);
    lines.push(`  ${pc.cyan(report.nextAction.command)}`);
  }
  return lines.join('\n');
}

/** Print the report as JSON or human text. */
export function printReport(report: StatusReport, opts: { json?: boolean }): void {
  console.info(opts.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

/**
 * Menu entry: report status for an already-loaded CLI context. Human output;
 * the standalone `pnpm --filter infra status --json` path serves machines.
 */
export async function runStatus(context: {
  environment: string;
  appConfig: EngineConfig;
  state: StackState;
  stackYaml?: string;
  projectId: string;
}): Promise<void> {
  const report = await withSpinner('Checking infra status', () =>
    buildReport({
      mode: context.environment,
      appConfig: context.appConfig,
      stackState: context.state,
      stackYaml: context.stackYaml,
      projectId: context.projectId || undefined,
    }),
  );
  printReport(report, { json: false });
}

/** Standalone entry: `pnpm --filter infra status [--mode <m>] [--json]`. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const flagMode = getFlag(argv, '--mode') ?? process.env.INFRA_MODE;
  if (flagMode && flagMode !== 'production' && flagMode !== 'staging')
    throw new Error(`--mode must be 'production' or 'staging' (got '${flagMode}')`);
  const mode =
    (flagMode as 'production' | 'staging' | undefined) ??
    pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
  const json = argv.includes('--json');

  loadBaseEnvFiles();
  const { appConfig, state: stackState, stackYaml, projectId } = await loadStackContext(mode);
  const report = await withSpinner('Checking infra status', () =>
    buildReport({ mode, appConfig, stackState, stackYaml, projectId: projectId || undefined }),
  );
  printReport(report, { json });
}

runIfMain(import.meta.url, main);

/** Which env pair the CLI found its key in: the admin application key from infra/.env.<mode>, or the process's own SCW_* pair. */
export type KeySlot = 'admin' | 'ambient';

/** The cheap facts printed on CLI start, before any menu: what is locked, what is live, and which key this machine authenticates with. */
export interface QuickFacts {
  lock?: LockInfo;
  control?: ControlState;
  /** The key's bearer and role, when it can describe itself, and the slot it came from. */
  key?: { desc: KeyDescription; role: PrincipalRole; slot: KeySlot };
  /** Probes that did not answer within the budget or errored, by name. */
  unavailable: string[];
}

/** Race a probe against the budget: a slow Scaleway call must not delay the menu. */
async function within<T>(ms: number, probe: Promise<T>): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([probe, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function collectQuickFacts(
  ctx: { environment: string; appConfig: EngineConfig; projectId?: string },
  opts: { budgetMs?: number; now?: number } = {},
): Promise<QuickFacts> {
  const budgetMs = opts.budgetMs ?? 4_000;
  const facts: QuickFacts = { unavailable: [] };
  const identity = resolveOperatorIdentity();
  const slot: KeySlot | undefined = identity.admin ? 'admin' : identity.ambient ? 'ambient' : undefined;
  const key = identity.admin ?? identity.ambient;
  const bucket = stateBucket(ctx.appConfig.slug);

  const stateProbe = async () => {
    if (!key) return;
    const s3 = await makeControlClient(ctx.appConfig.s3.region, key.accessKey, key.secretKey);
    const [lock, control] = await Promise.all([
      peekLock(s3, bucket, lockKey(ctx.environment)),
      readControlState(s3, bucket, controlKey(ctx.environment)).then((result) => result.state),
    ]);
    facts.lock = lock;
    facts.control = control;
  };
  const keyProbe = async () => {
    if (!key || !slot) return;
    const desc = await describeKey(key);
    facts.key = { desc, role: classifyPrincipal(desc, principalNames(ctx.appConfig.slug, ctx.environment)), slot };
  };
  await Promise.all([
    within(
      budgetMs,
      stateProbe().catch(() => facts.unavailable.push('state bucket')),
    ).then((v) => {
      if (v === undefined && key && !facts.control && !facts.unavailable.includes('state bucket'))
        facts.unavailable.push('state bucket');
    }),
    within(
      budgetMs,
      keyProbe().catch(() => facts.unavailable.push('key lookup')),
    ).then((v) => {
      if (v === undefined && key && !facts.key && !facts.unavailable.includes('key lookup'))
        facts.unavailable.push('key lookup');
    }),
  ]);
  return facts;
}

/** Human lines for the quick facts; pure, so the shape is testable without Scaleway. `configured` is the slot the env resolved to, or `none`. */
export function formatQuickFacts(
  facts: QuickFacts,
  opts: { now?: number; configured?: KeySlot | 'none' } = {},
): string[] {
  const now = opts.now ?? Date.now();
  const lines: string[] = [];
  if (facts.lock) {
    const expired = Date.parse(facts.lock.expiresAt) <= now;
    lines.push(
      `${expired ? warningMark : pc.yellow('●')} Lock: ${expired ? 'expired lease of' : 'held by'} ${pc.cyan(facts.lock.owner)} (${facts.lock.operation}, since ${facts.lock.acquiredAt.slice(0, 19).replace('T', ' ')} UTC)`,
    );
  } else if (facts.control || !facts.unavailable.includes('state bucket')) {
    lines.push(`${pc.green('●')} Lock: free`);
  }
  if (facts.control) {
    const active = Object.entries(facts.control.rollout)
      .filter(([, rollout]) => rollout.active)
      .map(([slug, rollout]) => `${slug} ${rollout.active?.sha.slice(0, 7)}`);
    const pending = Object.entries(facts.control.rollout)
      .filter(([, rollout]) => rollout.pendingSha)
      .map(([slug, rollout]) => `${slug} ${rollout.pendingSha?.slice(0, 7)} pending`);
    const when = facts.control.updatedAt
      ? ` (updated ${facts.control.updatedAt.slice(0, 16).replace('T', ' ')} UTC by ${facts.control.updatedBy ?? '?'})`
      : '';
    lines.push(`${pc.green('●')} Live: ${[...active, ...pending].join(', ') || 'nothing rolled out'}${when}`);
  }
  const fetchHint = 'Manage keys & secrets → Fetch admin application key';
  if (facts.key) {
    const { desc, role, slot } = facts.key;
    const hours = hoursUntilExpiry(desc, now);
    const expiry =
      hours === undefined
        ? ''
        : hours < 0
          ? ' — EXPIRED'
          : hours < 48
            ? ` — expires in ${Math.max(1, Math.round(hours))}h`
            : '';
    const healthy = slot === 'admin' && role === 'admin' && !(hours !== undefined && hours < 48);
    const label = slot === 'admin' ? 'Admin application key:' : 'Ambient key: SCW_ACCESS_KEY';
    lines.push(`${healthy ? pc.green('●') : warningMark} ${label} ${formatKeyLine(desc, role)}${expiry}`);
    if (slot === 'ambient') {
      lines.push(
        `  ${pc.dim(`CLI actions do not use the process's SCW_* pair; put the admin application key in infra/.env.<mode> as SCW_ADMIN_* (${fetchHint}).`)}`,
      );
    } else if (role !== 'admin') {
      lines.push(`  ${pc.dim(`SCW_ADMIN_* should hold the admin application key: ${fetchHint}.`)}`);
    }
  } else if (opts.configured === 'none') {
    lines.push(
      `${warningMark} Admin application key: none in infra/.env.<mode> (SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY; ${fetchHint})`,
    );
  }
  if (facts.unavailable.length > 0)
    lines.push(pc.dim(`  (${facts.unavailable.join(', ')}: no answer within the budget)`));
  return lines;
}

/** Print the quick facts for a loaded CLI context; never throws, never blocks longer than the budget. */
export async function printQuickFacts(context: {
  environment: string;
  appConfig: EngineConfig;
  projectId: string;
}): Promise<void> {
  const facts = await withSpinner('Checking lock, rollout and key', () =>
    collectQuickFacts({
      environment: context.environment,
      appConfig: context.appConfig,
      projectId: context.projectId || undefined,
    }),
  );
  const identity = resolveOperatorIdentity();
  const configured = identity.admin ? 'admin' : identity.ambient ? 'ambient' : 'none';
  for (const line of formatQuickFacts(facts, { configured })) console.info(line);
  console.info('');
}
