import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineConfig } from '../config/engine-config';
import { dbExposureConfigured } from '../lib/db-public-endpoint';
import { readAppliedEngine } from '../lib/deploy/applied-engine';
import { commitRefs } from '../lib/deploy/git-remote';
import { findJobDefinition, listJobRuns, readJobDefinition } from '../lib/deploy/job-runs';
import { readLiveRecord } from '../lib/deploy/live-record';
import type { RemoteRef } from '../lib/deploy/target';
import { deriveInfra, hasDomain as hasDeployDomain } from '../lib/naming';
import { type KeyPair, resolveOperatorIdentity } from '../lib/scaleway/operator-identity';
import { projectAccessKey } from '../lib/scaleway/s3-client';
import { pickStackShort, type StackState } from '../lib/stack/bootstrap-stack-state';
import { lockKey, makeControlClient, peekLock, stateBucket } from '../lib/stack/control-store';
import { loadStackContext } from '../lib/stack/stack-context';
import { nameSubject } from '../lib/status/check';
import { buildStatusReport } from '../lib/status/registry';
import type { CheckStatus, ProbeSession, ScalewayFacts, StatusReport } from '../lib/status/types';
import { getFlag } from '../lib/utils/args';
import { checkMark, crossMark, DIVIDER, pc, warningMark, withSpinner } from '../lib/utils/cli-output';
import { loadRootEnvFile } from '../lib/utils/env-files';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';

/** Everything the report needs about the target stack, from the menu or standalone. */
export interface StatusContext {
  mode: string;
  appConfig: EngineConfig;
  stackState: StackState;
  stackYaml?: string;
  projectId?: string;
  /** The operator key, when the run holds it: the machines are listed with it. */
  operatorKey?: KeyPair;
}

/** An S3-style NoSuchBucket, distinct from a refused read (bucket exists). */
function isNoSuchBucket(err: unknown): boolean {
  const e = err as { name?: string };
  return e?.name === 'NoSuchBucket';
}

/**
 * Build the probe session the providers draw on: resolved stack context, the key to probe with (the observer key, else the key the process
 * was started with), and one memoized best-effort read of the state bucket's presence, the control records (the lease, the live record, the
 * rotations) and the main job's definition with its newest runs, shared by the providers.
 */
export function buildSession(ctx: StatusContext): ProbeSession {
  const identity = resolveOperatorIdentity();
  const aws =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKey: process.env.AWS_ACCESS_KEY_ID, secretKey: process.env.AWS_SECRET_ACCESS_KEY }
      : undefined;
  const key = identity.observer ?? identity.ambient ?? aws;
  const projectId = ctx.projectId ?? process.env.SCW_DEFAULT_PROJECT_ID;
  const accessKey = key?.accessKey;
  const secretKey = key?.secretKey;
  const scalewayKeyAvailable = Boolean(accessKey && secretKey);
  let hasDomain = false;
  try {
    hasDomain = deriveInfra(ctx.appConfig).hasDomain;
  } catch {
    hasDomain = hasDeployDomain(ctx.appConfig);
  }

  let memo: Promise<ScalewayFacts> | undefined;
  const scalewayFacts = (): Promise<ScalewayFacts> => {
    memo ??= (async () => {
      const out: ScalewayFacts = {};
      if (!scalewayKeyAvailable || !accessKey || !secretKey) return out;
      try {
        // The buckets are in the environment's project, which a key made in another one names as `<access key>@<project id>`.
        const s3 = await makeControlClient(ctx.appConfig.s3.region, projectId ? projectAccessKey(accessKey, projectId) : accessKey, secretKey);
        const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
        try {
          await s3.send(new ListObjectsV2Command({ Bucket: stateBucket(ctx.appConfig.slug), MaxKeys: 1 }));
          out.stateBucketExists = true;
        } catch (err) {
          if (isNoSuchBucket(err)) out.stateBucketExists = false;
        }
        const controlBucket = deriveInfra(ctx.appConfig).naming.bootDiagBucket;
        try {
          const info = await peekLock(s3, controlBucket, lockKey(ctx.mode));
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
        try {
          out.live = (await readLiveRecord(s3, controlBucket, ctx.mode)).record;
        } catch {
          // Leave live undefined (reported as unknown).
        }
        try {
          out.applied = (await readAppliedEngine(s3, controlBucket, ctx.mode)) ?? null;
        } catch {
          // Leave applied undefined (reported as unknown).
        }
      } catch {
        // Leave every field undefined (reported as unknown).
      }
      try {
        const { naming, region } = deriveInfra(ctx.appConfig);
        const auth = { secretKey };
        const definitionId = projectId && (await findJobDefinition(auth, { region, projectId, name: naming.resource('main') }));
        if (projectId && !definitionId) out.mainJob = null;
        if (projectId && definitionId) {
          const [definition, runs] = await Promise.all([
            readJobDefinition(auth, { region, definitionId }),
            listJobRuns(auth, { region, projectId, definitionId }),
          ]);
          out.mainJob = { definitionId, definition, runs };
        }
      } catch {
        // Leave mainJob undefined (reported as unknown).
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
    projectId,
    scalewayKeyAvailable,
    accessKey,
    secretKey,
    operatorKey: ctx.operatorKey,
    hasDomain,
    dbExposureConfigured: dbExposureConfigured(ctx.mode, ctx.stackYaml),
    scalewayFacts,
  };
}

/** Build the full report (provider registry + wall-clock stamp). */
export async function buildReport(ctx: StatusContext): Promise<StatusReport> {
  return buildStatusReport(buildSession(ctx));
}

const MARKS: Record<CheckStatus, string> = { ok: checkMark, warn: warningMark, missing: crossMark, error: crossMark, unknown: pc.dim('?') };

export function formatReport(report: StatusReport, refs?: readonly RemoteRef[]): string {
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
    lines.push(`${MARKS[check.status]} ${label}  ${nameSubject(check, refs)}`);
  }
  if (report.nextAction) {
    lines.push(pc.dim(DIVIDER));
    lines.push(`${pc.bold('Next:')} ${report.nextAction.description}`);
    lines.push(`  ${pc.cyan(report.nextAction.command)}`);
  }
  return lines.join('\n');
}

/** Print the report as JSON or human text. */
export function printReport(report: StatusReport, opts: { json?: boolean; refs?: readonly RemoteRef[] }): void {
  console.info(opts.json ? JSON.stringify(report, null, 2) : formatReport(report, opts.refs));
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
  operatorKey?: KeyPair;
}): Promise<void> {
  const recent = recentReport(context.environment);
  const report =
    recent ??
    (await withSpinner(`Checking ${context.environment}`, () =>
      buildReport({
        mode: context.environment,
        appConfig: context.appConfig,
        stackState: context.state,
        stackYaml: context.stackYaml,
        projectId: context.projectId || undefined,
        operatorKey: context.operatorKey,
      }),
    ));
  printReport(report, { json: false, refs: await commitRefs() });
  if (recent) console.info(pc.dim(`As read ${Math.round((Date.now() - Date.parse(recent.generatedAt)) / 1000)} s ago, for the home screen.`));
}

/** How long a report the home screen read serves the full table too, so one key after the home does not read everything again. */
const REPORT_FRESH_MS = 120_000;

let lastReport: StatusReport | undefined;

/** Keep the report the home screen read, for a full status asked right after. */
export function rememberReport(report: StatusReport): void {
  lastReport = report;
}

/** The remembered report of a mode while it is fresh. */
function recentReport(mode: string): StatusReport | undefined {
  if (!lastReport || lastReport.mode !== mode || Date.now() - Date.parse(lastReport.generatedAt) > REPORT_FRESH_MS) return undefined;
  return lastReport;
}

/** The inventory alone (`inventory.*`), as Rotate keys prints it at its end: what remains beside the declared identities and machines. */
export async function printInventory(context: Parameters<typeof runStatus>[0]): Promise<void> {
  const report = await buildReport({
    mode: context.environment,
    appConfig: context.appConfig,
    stackState: context.state,
    stackYaml: context.stackYaml,
    projectId: context.projectId || undefined,
    operatorKey: context.operatorKey,
  });
  const inventory = report.checks.filter((check) => check.id.startsWith('inventory.'));
  console.info(`\n${pc.bold('Inventory')} ${pc.dim('(what exists beside what the environment declares)')}`);
  for (const check of inventory) console.info(`${MARKS[check.status]} ${pc.bold(check.title)}  ${check.detail}`);
}

/** Standalone entry: `pnpm --filter infra status [--mode <m>] [--json]`. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const flagMode = getFlag(argv, '--mode') ?? process.env.INFRA_MODE;
  if (flagMode && flagMode !== 'production' && flagMode !== 'staging')
    throw new Error(`--mode must be 'production' or 'staging' (got '${flagMode}')`);
  const mode = (flagMode as 'production' | 'staging' | undefined) ?? pickStackShort((name) => existsSync(resolve(infraDir, `Pulumi.${name}.yaml`)));
  const json = argv.includes('--json');

  loadRootEnvFile();
  const { appConfig, state: stackState, stackYaml, projectId } = await loadStackContext(mode);
  const report = await withSpinner(`Checking ${mode}`, () =>
    buildReport({ mode, appConfig, stackState, stackYaml, projectId: projectId || undefined }),
  );
  printReport(report, { json, refs: json ? undefined : await commitRefs() });
}

runIfMain(import.meta.url, main);
