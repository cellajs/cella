import { listRemoteRefs } from '../lib/deploy/git-remote';
import type { JobRun } from '../lib/deploy/job-runs';
import type { LiveRecord } from '../lib/deploy/live-record';
import { repositoryUrl } from '../lib/deploy/repository-key';
import { commitName, type RemoteRef } from '../lib/deploy/target';
import { actionCommand, isOperatorActionId, menuPath } from '../lib/operator-actions';
import { resolveOperatorIdentity } from '../lib/scaleway/operator-identity';
import type { Check, StatusReport } from '../lib/status/types';
import { checkMark, crossMark, pc, warningMark } from '../lib/utils/cli-output';
import { within } from '../lib/utils/retry';
import { buildSession, rememberReport } from '../tasks/status';
import { liveDbEndpoints } from './actions/db-exposure';
import type { UpNext } from './menu';
import { rememberedOperatorKey } from './session';
import type { InfraContext } from './shared';

/** What the home screen is drawn from: the status report and the facts its session read, with names for the commits. */
export interface HomeFacts {
  report: StatusReport;
  live?: LiveRecord;
  jobRuns?: readonly JobRun[];
  /** The repository's tags and branch heads, when it answered in time: they name the commits. */
  refs?: RemoteRef[];
  liveEndpoints?: string[];
  /** False when this machine holds no observer key, so every Scaleway check is unknown. */
  keyConfigured: boolean;
}

const REFS_BUDGET_MS = 4_000;

/** Read everything the home screen shows, in one round of parallel reads on the observer key. */
export async function collectHome(context: InfraContext): Promise<HomeFacts> {
  const { buildStatusReport } = await import('../lib/status/registry');
  const session = buildSession({
    mode: context.environment,
    appConfig: context.appConfig,
    stackState: context.state,
    stackYaml: context.stackYaml,
    projectId: context.projectId || undefined,
    operatorKey: rememberedOperatorKey(),
  });
  const refs = within(
    REFS_BUDGET_MS,
    Promise.resolve()
      .then(() => listRemoteRefs(repositoryUrl(), process.env.REPOSITORY_READ_KEY)(['refs/tags/*', 'refs/heads/*']))
      .catch(() => undefined),
  );
  const [report, remote, liveEndpoints] = await Promise.all([buildStatusReport(session), refs, liveDbEndpoints(context)]);
  rememberReport(report);
  const facts = await session.scalewayFacts();
  const identity = resolveOperatorIdentity();
  return {
    report,
    live: facts.live,
    jobRuns: facts.mainJob?.runs,
    refs: remote,
    liveEndpoints,
    keyConfigured: Boolean(identity.observer ?? identity.ambient),
  };
}

const MARK = { ok: pc.green('●'), warn: pc.yellow('!'), missing: crossMark, error: crossMark, unknown: pc.dim('?') } as const;

const ONE_DAY_MS = 86_400_000;

/** `Nov 2` for a day, or '' without a moment. */
function day(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
}

/** The commits the live record serves, named: one name when every role serves the same release, else one per role. */
function servingLine(facts: HomeFacts): string {
  const roles = Object.entries(facts.live?.roles ?? {});
  if (roles.length === 0) return 'nothing deployed yet';
  const names = new Set(roles.map(([, role]) => commitName(facts.refs, role.commit)));
  const what = names.size === 1 ? [...names][0] : roles.map(([role, entry]) => `${role} ${commitName(facts.refs, entry.commit)}`).join(', ');
  const since = facts.live?.updatedAt ? ` since ${day(facts.live.updatedAt)}` : '';
  const services = facts.report.checks.filter((check) => check.id.startsWith('live.') && check.id !== 'live.components');
  const healthy = services.filter((check) => check.status === 'ok').length;
  const health =
    services.length === 0
      ? ''
      : healthy === services.length
        ? ` · ${services.length} service${services.length === 1 ? '' : 's'} healthy`
        : ` · ${pc.red(`${services.length - healthy} of ${services.length} services unhealthy`)}`;
  return `${what}${since}${health}`;
}

/** The main job's runs that failed in the last day, as a count after the last deploy's verdict. */
function failedToday(facts: HomeFacts, now: number): string {
  const failed = (facts.jobRuns ?? []).filter((run) => run.state === 'failed' && now - Date.parse(run.created_at ?? '') < ONE_DAY_MS).length;
  return failed > 1 ? ` · ${failed} failed runs today` : '';
}

const SECURITY_IDS = /^(inventory\.|identity\.keyAges$)/;

/** The security checks that found something: what exists beside the declared identities, and a key past its age. */
function securityFindings(report: StatusReport): Check[] {
  return report.checks.filter(
    (entry) => SECURITY_IDS.test(entry.id) && (entry.status === 'error' || entry.status === 'warn' || entry.status === 'missing'),
  );
}

/**
 * The step the report recommends, as the menu runs it: a next action whose command names one action of the CLI, else the full status
 * when the security checks found something, which name no command of their own (the console deletes what they find).
 */
export function upNextOf(report: StatusReport): UpNext | undefined {
  const next = report.nextAction;
  const word = next ? /^pnpm infra ([a-z][a-z-]*)/.exec(next.command)?.[1] : undefined;
  if (next && word && isOperatorActionId(word)) return { action: word, description: next.description };
  if (next) return undefined;
  const findings = securityFindings(report);
  if (findings.length === 0) return undefined;
  return { action: 'status', description: `Read the ${findings.length === 1 ? 'security finding' : `${findings.length} security findings`}` };
}

/** A detail with every commit id in it named: `deployed c19588d491` reads `deployed 0.34.0`. */
function nameCommits(detail: string, refs: RemoteRef[] | undefined): string {
  return detail.replace(/\b[0-9a-f]{7,40}\b/g, (sha) => commitName(refs, sha));
}

/** One home line: mark, label padded, detail. */
function row(status: keyof typeof MARK, label: string, detail: string): string {
  return `${MARK[status]} ${label.padEnd(12)} ${detail}`;
}

/**
 * The home screen under the environment line: what serves, how the last deploy went, the database, the security findings, then anything
 * else the report flags, and the recommended step. Pure, so a fixture report renders in a test.
 */
export function formatHome(facts: HomeFacts, opts: { now?: number } = {}): string[] {
  const now = opts.now ?? Date.now();
  const { report } = facts;
  const check = (id: string): Check | undefined => report.checks.find((entry) => entry.id === id);
  const lines: string[] = [];
  if (report.stackState !== 'bootstrapped') return lines;
  if (!facts.keyConfigured) {
    lines.push(
      `${warningMark} Not read: this machine has no observer key, and every check below is unknown ("${menuPath('identity')}" puts one here).`,
    );
  }
  const components = check('live.components');
  lines.push(row(components && components.status !== 'ok' ? components.status : 'ok', 'Serving', servingLine(facts)));
  const last = check('runs.last');
  if (last) lines.push(row(last.status, 'Last deploy', `${nameCommits(last.detail, facts.refs)}${failedToday(facts, now)}`));
  const db = check('db.publicEndpoint');
  if (db) lines.push(row(db.status, 'Database', db.detail === 'private only' ? 'private' : db.detail));
  const security = report.checks.filter((entry) => SECURITY_IDS.test(entry.id));
  const findings = securityFindings(report);
  if (security.length > 0) {
    lines.push(
      findings.length === 0
        ? row(
            security.every((entry) => entry.status === 'ok') ? 'ok' : 'unknown',
            'Security',
            security.every((entry) => entry.status === 'ok') ? 'no findings' : 'not read',
          )
        : row('warn', 'Security', `${findings.length} finding${findings.length === 1 ? '' : 's'} ${pc.dim(`("${menuPath('status')}" lists them)`)}`),
    );
  }
  // Anything else that needs doing, one line each: the lease, the schedule, a missing secret, DNS.
  const shown = new Set(['runs.last', 'db.publicEndpoint', 'live.components', 'config.stackState', 'identity.project', 'environments.lines']);
  for (const entry of report.checks) {
    if (shown.has(entry.id) || entry.id.startsWith('live.') || SECURITY_IDS.test(entry.id)) continue;
    if (entry.status === 'ok' || entry.status === 'unknown') continue;
    lines.push(row(entry.status, entry.title, entry.detail));
  }
  const upNext = upNextOf(report);
  if (report.nextAction || upNext) {
    lines.push('');
    lines.push(`${pc.bold('Up next')}      ${report.nextAction?.description ?? upNext?.description}`);
    lines.push(`             ${pc.dim(report.nextAction?.command ?? (upNext ? actionCommand(upNext.action) : ''))}`);
  } else if (facts.keyConfigured) {
    lines.push('');
    lines.push(`${checkMark} Nothing needs doing.`);
  }
  return lines;
}
