import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import { resolveProjectId } from '../lib/scaleway/bootstrap-scw-env';
import {
  detectComputeDeferred,
  detectStackState,
  pickStackShort,
  type StackState,
} from '../lib/stack/bootstrap-stack-state';
import {
  controlKey,
  lockKey,
  makeControlClient,
  peekLock,
  readControlState,
  stateBucket,
} from '../lib/stack/control-store';
import { buildStatusReport } from '../lib/status/registry';
import type { CheckStatus, ProbeSession, ScalewayFacts, StatusReport } from '../lib/status/types';
import { checkMark, crossMark, DIVIDER, pc, warningMark, withSpinner } from '../lib/utils/cli-output';
import { loadBaseEnvFiles, loadModeEnvFile } from '../lib/utils/env-files';
import { isMain } from '../lib/utils/is-main';
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

  // Same loading order as the CLI; silent so `--json` output stays parseable.
  loadBaseEnvFiles();
  loadModeEnvFile(mode);
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();

  const stackPath = resolve(infraDir, `Pulumi.${mode}.yaml`);
  const stackYaml = existsSync(stackPath) ? readFileSync(stackPath, 'utf8') : undefined;
  const stackState = detectStackState({ yamlText: stackYaml });

  const report = await withSpinner('Checking infra status', () =>
    buildReport({ mode, appConfig, stackState, stackYaml, projectId: resolveProjectId() }),
  );
  printReport(report, { json });
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
