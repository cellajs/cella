import { commitRefs } from '../lib/deploy/git-remote';
import type { JobRun } from '../lib/deploy/job-runs';
import type { LiveRecord } from '../lib/deploy/live-record';
import { commitName, type RemoteRef } from '../lib/deploy/target';
import { isOperatorActionId, menuPath } from '../lib/operator-actions';
import { resolveOperatorIdentity } from '../lib/scaleway/operator-identity';
import { rowText } from '../lib/status/check';
import type { Check, CheckStatus, StatusReport } from '../lib/status/types';
import { pc, warningMark } from '../lib/utils/cli-output';
import { buildSession, fill, markOf, rememberReport, statusRow, statusRows } from '../tasks/status';
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

/** How long the home waits for a check before it reads unknown: a stalled endpoint must not keep the menu shut. */
const HOME_BUDGET_MS = 12_000;

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
  const [report, remote, liveEndpoints] = await Promise.all([
    buildStatusReport(session, { budgetMs: HOME_BUDGET_MS }),
    commitRefs(),
    liveDbEndpoints(context),
  ]);
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

const ONE_DAY_MS = 86_400_000;

/** `Nov 2` for a day, or '' without a moment. */
function day(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
}

/** How long ago a moment was, in its largest whole unit: `5 min ago`, `an hour ago`, `3 d ago`. */
function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  const hours = Math.floor(minutes / 60);
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** The releases the live record serves, by name: one when every role serves the same. */
function servedNames(facts: HomeFacts): Set<string> {
  return new Set(Object.values(facts.live?.roles ?? {}).map((role) => commitName(facts.refs, role.commit)));
}

/** The commits the live record serves, named: one name when every role serves the same release, else one per role. */
function servingLine(facts: HomeFacts): string {
  const roles = Object.entries(facts.live?.roles ?? {});
  if (roles.length === 0) return 'nothing deployed yet';
  const names = servedNames(facts);
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

/** The worst status among checks that were read: what the Live line's mark says of the services and their components. */
function worst(checks: readonly Check[]): CheckStatus {
  const read = checks.map((check) => check.status).filter((status) => status !== 'unknown');
  return (['error', 'missing', 'warn', 'ok'] as const).find((status) => read.includes(status)) ?? 'unknown';
}

/** The main job's runs that failed in the last day, counted when more than one did; '' otherwise. */
function failedToday(facts: HomeFacts, now: number): string {
  const failed = (facts.jobRuns ?? []).filter((run) => run.state === 'failed' && now - Date.parse(run.created_at ?? '') < ONE_DAY_MS).length;
  return failed > 1 ? `${failed} failed runs today` : '';
}

const SECURITY_IDS = /^(inventory\.|identity\.keyAges$)/;

/** A check that needs a person: it ran, and found something. */
const needsPerson = (check: Check): boolean => check.status !== 'ok' && check.status !== 'unknown';

/** The security checks that found something: what exists beside the declared identities, and a key past its age. */
function securityFindings(report: StatusReport): Check[] {
  return report.checks.filter((entry) => SECURITY_IDS.test(entry.id) && needsPerson(entry));
}

/**
 * The step the report recommends, as the menu runs it: a next action whose command names one action of the CLI, a failed or blocked
 * deploy's log named by its release; else following the deploy under way (Deploy now follows it); else the full status when the security
 * checks found something, which name no command of their own (the console deletes what they find).
 */
export function upNextOf(report: StatusReport, refs?: readonly RemoteRef[]): UpNext | undefined {
  const next = report.nextAction;
  const word = next ? /^pnpm infra ([a-z][a-z-]*)/.exec(next.command)?.[1] : undefined;
  const last = report.checks.find((entry) => entry.id === 'runs.last');
  if (next && word && isOperatorActionId(word)) {
    const name = word === 'runs' && last?.subject && needsPerson(last) ? commitName(refs, last.subject) : undefined;
    const read = name && (last?.status === 'warn' ? `Read what ${name} waits for` : `Read the boot log of ${name}`);
    return { action: word, description: read || next.description };
  }
  if (next) return undefined;
  if (last?.subject && / is deploying$/.test(last.detail)) {
    return { action: 'start-deploy', description: `Follow the deploy of ${commitName(refs, last.subject)}` };
  }
  const findings = securityFindings(report);
  if (findings.length === 0) return undefined;
  return { action: 'status', description: `Review the ${findings.length === 1 ? 'security finding' : `${findings.length} security findings`}` };
}

/** The checks the home folds into its own lines, or that only setup changes. */
const FOLDED = new Set(['runs.last', 'db.publicEndpoint', 'config.stackState', 'identity.project', 'environments.lines']);

/**
 * The home screen under the header: the Live line always, then only what needs a person: a deploy that failed, waits or runs, an open
 * database, the security findings by what they found, and any other check that found something. Pure, so a fixture report renders in a test.
 */
export function formatHome(facts: HomeFacts, opts: { now?: number } = {}): string[] {
  const now = opts.now ?? Date.now();
  const { report, refs } = facts;
  const check = (id: string): Check | undefined => report.checks.find((entry) => entry.id === id);
  if (report.stackState !== 'bootstrapped') return [];
  const lines: string[] = [];
  if (!facts.keyConfigured) {
    lines.push(statusRow(warningMark, 'Not read', `this machine has no observer key: "${menuPath('identity')}" puts one here`));
  }
  // A last deploy shows when it needs a person, or when it is not what serves: one that runs, or one a roll back replaced.
  const last = check('runs.last');
  const served = servedNames(facts);
  const name = last?.subject ? commitName(refs, last.subject) : undefined;
  const elsewhere = name !== undefined && !(served.size === 1 && served.has(name));
  if (last && (needsPerson(last) || (last.status === 'ok' && elsewhere))) {
    const when = last.at ? ` ${ago(last.at, now)}` : '';
    const keeps = needsPerson(last) && elsewhere && served.size === 1 ? `${[...served][0]} keeps serving` : '';
    const parts = [`${rowText(last, refs)}${when}`, keeps, failedToday(facts, now)].filter(Boolean);
    lines.push(...statusRows(markOf(last.status), 'Last deploy', fill(parts, ' · ')));
  }
  const db = check('db.publicEndpoint');
  if (db && needsPerson(db)) lines.push(statusRow(markOf(db.status), 'Database', rowText(db, refs)));
  const findings = securityFindings(report);
  if (findings.length > 0)
    lines.push(
      ...statusRows(
        warningMark,
        'Security',
        fill(
          findings.map((entry) => rowText(entry, refs)),
          ' · ',
        ),
      ),
    );
  for (const entry of report.checks) {
    if (FOLDED.has(entry.id) || entry.id.startsWith('live.') || SECURITY_IDS.test(entry.id) || !needsPerson(entry)) continue;
    lines.push(statusRow(markOf(entry.status), entry.title, rowText(entry, refs)));
  }
  const liveChecks = report.checks.filter((entry) => entry.id.startsWith('live.'));
  const serving = facts.keyConfigured ? servingLine(facts) : 'not read';
  const mark = markOf(facts.keyConfigured ? worst(liveChecks) : 'unknown');
  const live = statusRow(mark, 'Live', `${serving}${lines.length === 0 ? pc.dim(' · all checks pass') : ''}`);
  return [live, ...lines];
}
