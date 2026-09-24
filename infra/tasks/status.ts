import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env';
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
 * Build the probe session the providers draw on: resolved stack context,
 * credentials, and one memoized best-effort control-store read shared by the
 * state and live providers.
 */
export function buildSession(ctx: StatusContext): ProbeSession {
  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  const credentialsAvailable = Boolean(accessKey && secretKey);
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
      if (!credentialsAvailable || !accessKey || !secretKey) return out;
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
    credentialsAvailable,
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

/** The cheap facts printed on CLI start, before any menu: what is locked, what is live, and which key this machine authenticates with. */
export interface QuickFacts {
  lock?: LockInfo;
  control?: ControlState;
  /** The standing key's bearer and role, when the key can describe itself. */
  standing?: { desc: KeyDescription; role: PrincipalRole };
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
  const bucket = stateBucket(ctx.appConfig.slug);

  const stateProbe = async () => {
    if (!identity.state) return;
    const s3 = await makeControlClient(ctx.appConfig.s3.region, identity.state.accessKey, identity.state.secretKey);
    const [lock, control] = await Promise.all([
      peekLock(s3, bucket, lockKey(ctx.environment)),
      readControlState(s3, bucket, controlKey(ctx.environment)).then((result) => result.state),
    ]);
    facts.lock = lock;
    facts.control = control;
  };
  const keyProbe = async () => {
    if (!identity.standing) return;
    const desc = await describeKey(identity.standing);
    facts.standing = { desc, role: classifyPrincipal(desc, principalNames(ctx.appConfig.slug, ctx.environment)) };
  };
  await Promise.all([
    within(
      budgetMs,
      stateProbe().catch(() => facts.unavailable.push('state bucket')),
    ).then((v) => {
      if (v === undefined && identity.state && !facts.control && !facts.unavailable.includes('state bucket'))
        facts.unavailable.push('state bucket');
    }),
    within(
      budgetMs,
      keyProbe().catch(() => facts.unavailable.push('key lookup')),
    ).then((v) => {
      if (v === undefined && identity.standing && !facts.standing && !facts.unavailable.includes('key lookup'))
        facts.unavailable.push('key lookup');
    }),
  ]);
  return facts;
}

/** Human lines for the quick facts; pure, so the shape is testable without Scaleway. */
export function formatQuickFacts(facts: QuickFacts, opts: { now?: number; hasStandingKey?: boolean } = {}): string[] {
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
  if (facts.standing) {
    const { desc, role } = facts.standing;
    const hours = hoursUntilExpiry(desc, now);
    const expiry =
      hours === undefined
        ? ''
        : hours < 0
          ? ' — EXPIRED'
          : hours < 48
            ? ` — expires in ${Math.max(1, Math.round(hours))}h`
            : '';
    const mark = role === 'admin' && !(hours !== undefined && hours < 48) ? pc.green('●') : warningMark;
    lines.push(`${mark} Key: SCW_ACCESS_KEY ${formatKeyLine(desc, role)}${expiry}`);
    if (role !== 'admin') {
      lines.push(
        `  ${pc.dim('The standing slot should hold the admin application key: Manage keys & secrets → Fetch operator credentials.')}`,
      );
    }
  } else if (opts.hasStandingKey === false) {
    lines.push(
      `${warningMark} Key: no SCW_ACCESS_KEY / SCW_SECRET_KEY in infra/.env.<mode> (Manage keys & secrets → Fetch operator credentials)`,
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
  const hasStandingKey = Boolean(resolveOperatorIdentity().standing);
  for (const line of formatQuickFacts(facts, { hasStandingKey })) console.info(line);
  console.info('');
}
