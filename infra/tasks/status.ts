import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EngineConfig } from '../config/engine-config';
import { dbExposureConfigured } from '../lib/db-public-endpoint';
import { readAppliedEngine } from '../lib/deploy/applied-engine';
import { commitRefs } from '../lib/deploy/git-remote';
import { findJobDefinition, listJobRuns, readJobDefinition } from '../lib/deploy/job-runs';
import { readLiveRecord } from '../lib/deploy/live-record';
import { commitName, type RemoteRef } from '../lib/deploy/target';
import { deriveInfra, hasDomain as hasDeployDomain } from '../lib/naming';
import { type KeyPair, resolveOperatorIdentity } from '../lib/scaleway/operator-identity';
import { projectAccessKey } from '../lib/scaleway/s3-client';
import { pickStackShort, type StackState } from '../lib/stack/bootstrap-stack-state';
import { lockKey, makeControlClient, peekLock, stateBucket } from '../lib/stack/control-store';
import { loadStackContext } from '../lib/stack/stack-context';
import { nameSubject, rowText } from '../lib/status/check';
import { buildStatusReport, checkGroups, groupOf } from '../lib/status/registry';
import type { Check, CheckStatus, ProbeSession, ScalewayFacts, StatusReport } from '../lib/status/types';
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

/** The mark a status row starts with. */
export function markOf(status: CheckStatus): string {
  return MARKS[status];
}

/** Where a row's detail starts: the mark, a space, the label padded to 12, a space. */
const DETAIL_COLUMN = 15;
/** The widest line a row prints. */
const ROW_WIDTH = 100;
const INDENT = ' '.repeat(DETAIL_COLUMN);

/** One status row: mark, bold label padded to the detail column, detail. */
export function statusRow(mark: string, label: string, detail: string): string {
  return `${mark} ${pc.bold(label.padEnd(DETAIL_COLUMN - 3))} ${detail}`;
}

/** A row whose detail runs on: its first line beside the label, the others under it at the detail column. */
export function statusRows(mark: string, label: string, lines: readonly string[]): string[] {
  return lines.map((line, index) => (index === 0 ? statusRow(mark, label, line) : `${INDENT}${line}`));
}

/** Parts joined by `separator` into lines of at most `width` characters, a part never split. */
export function fill(parts: readonly string[], separator: string, width = ROW_WIDTH - DETAIL_COLUMN): string[] {
  const lines: string[] = [];
  for (const part of parts) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + separator.length + part.length <= width) lines[lines.length - 1] = `${last}${separator}${part}`;
    else lines.push(part);
  }
  return lines;
}

/** The items a finding names, one per line at the detail column, in columns: the first plain, the others dim. */
function itemLines(items: readonly string[][]): string[] {
  const widths: number[] = [];
  for (const item of items) for (const [index, cell] of item.entries()) widths[index] = Math.max(widths[index] ?? 0, cell.length);
  return items.map(([first = '', ...rest]) => {
    const cells = rest.map((cell, index) => (index < rest.length - 1 ? cell.padEnd(widths[index + 1] ?? 0) : cell));
    return `${INDENT}${cells.length > 0 ? `${first.padEnd(widths[0] ?? 0)}  ${pc.dim(cells.join('  '))}` : first}`;
  });
}

/** A check's row; one that needs a person adds the items it names, or the detail its headline shortens, and what fixes it. */
export function checkLines(check: Check, refs?: readonly RemoteRef[]): string[] {
  const lines = [statusRow(MARKS[check.status], check.title, rowText(check, refs))];
  if (check.status === 'ok' || check.status === 'unknown') return lines;
  if (check.items?.length) lines.push(...itemLines(check.items));
  else if (check.headline) lines.push(...fill(nameSubject(check, refs).split(' '), ' ').map((line) => `${INDENT}${pc.dim(line)}`));
  const fixes = [check.fix, check.nextAction?.description].flatMap((fix) => (fix ? fill(fix.split(' '), ' ', ROW_WIDTH - DETAIL_COLUMN - 5) : []));
  lines.push(...fixes.map((line, index) => `${INDENT}${index === 0 ? pc.bold('Fix') : '   '}  ${line}`));
  return lines;
}

/** The ok checks, one line per group: each check's headline or detail once, the services that serve one release counted as one phrase. */
function okLines(checks: readonly Check[], refs?: readonly RemoteRef[]): string[] {
  const phrases = new Map<string, Set<string>>();
  const services = checks.filter((check) => check.id.startsWith('live.') && check.id !== 'live.components');
  const served = new Set(services.map((check) => (check.subject ? commitName(refs, check.subject) : rowText(check, refs))));
  const servedOne = `${services.length} service${services.length === 1 ? ' serves' : 's serve'} ${[...served][0]}`;
  const rank = (check: Check) => groupOf(check.id)?.rank ?? Number.MAX_SAFE_INTEGER;
  for (const check of [...checks].sort((a, b) => rank(a) - rank(b))) {
    const group = groupOf(check.id)?.label ?? 'Other';
    const phrase = served.size === 1 && services.includes(check) ? servedOne : rowText(check, refs);
    phrases.set(group, (phrases.get(group) ?? new Set()).add(phrase));
  }
  return [...checkGroups, 'Other'].flatMap((group) => {
    const parts = phrases.get(group);
    return parts ? statusRows(checkMark, group, fill([...parts], ' · ')) : [];
  });
}

/**
 * The full status: a title with how long ago it was read and the counts, then what needs a person (each finding with its items and its
 * fix), what could not be read, and the ok checks folded into one line per group.
 */
export function formatReport(report: StatusReport, refs?: readonly RemoteRef[], opts: { now?: number } = {}): string {
  const seconds = Math.max(0, Math.round(((opts.now ?? Date.now()) - Date.parse(report.generatedAt)) / 1000));
  const read = ` · read ${seconds < 2 ? 'just now' : `${seconds} s ago`}`;
  const s = report.summary;
  const counts = (
    [
      [s.ok, 'ok'],
      [s.warn + s.missing + s.error, 'to fix'],
      [s.unknown, 'not read'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${word}`)
    .join(' · ');
  const gap = ' '.repeat(Math.max(2, DIVIDER.length - 'Full status'.length - read.length - counts.length));
  const lines = [`${pc.bold('Full status')}${pc.dim(read)}${gap}${pc.dim(counts)}`];
  const toFix = report.checks.filter((check) => check.status !== 'ok' && check.status !== 'unknown');
  const unknown = report.checks.filter((check) => check.status === 'unknown');
  if (toFix.length > 0)
    lines.push('', pc.bold('To fix'), ...toFix.flatMap((check, index) => [...(index > 0 ? [''] : []), ...checkLines(check, refs)]));
  if (unknown.length > 0) lines.push('', pc.bold('Not read'), ...unknown.flatMap((check) => checkLines(check, refs)));
  const ok = report.checks.filter((check) => check.status === 'ok');
  if (ok.length > 0) lines.push('', pc.bold('OK'), ...okLines(ok, refs));
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
  for (const check of inventory) for (const line of checkLines(check)) console.info(line);
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
