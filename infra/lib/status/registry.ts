import { componentsProvider } from './providers/components';
import { dnsProvider } from './providers/dns';
import { githubProvider } from './providers/github';
import { liveProvider } from './providers/live';
import { secretsProvider } from './providers/secrets';
import { identityProvider, stackProvider } from './providers/stack';
import { stateProvider } from './providers/state';
import { storesProvider } from './providers/stores';
import { toolingProvider } from './providers/tooling';
import type { Check, CheckStatus, NextAction, ProbeSession, StatusProvider, StatusReport } from './types';
import { STATUS_SCHEMA_VERSION } from './types';

/** The registered status providers, in report order. Each owns its domain's gather and evaluate; this module owns the envelope, summary, and cross-domain next-action priority. */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous provider fact types collapse at the registry boundary
export const statusProviders: readonly StatusProvider<any>[] = [
  toolingProvider,
  stackProvider,
  identityProvider,
  githubProvider,
  stateProvider,
  secretsProvider,
  liveProvider,
  componentsProvider,
  dnsProvider,
  storesProvider,
];

/** Priority order for the single top-level `nextAction`: the earliest problematic check wins, following the setup to deploy to operate lifecycle. A trailing `.` matches by id prefix. */
const NEXT_ACTION_PRIORITY = [
  'tooling.pulumi',
  'identity.project',
  'config.stackState',
  'stores.',
  'github.environment',
  'state.bucket',
  'secrets.required',
  'config.computeDeferred',
  'rollout',
  'live.',
  'dns.zone',
  'state.lock',
];

/** A check contributes a top-level action only when it actually needs doing. */
const ACTIONABLE: ReadonlySet<CheckStatus> = new Set<CheckStatus>(['error', 'missing', 'warn']);

function pickNextAction(checks: Check[]): NextAction | undefined {
  for (const key of NEXT_ACTION_PRIORITY) {
    const match = checks.find((c) => (key.endsWith('.') ? c.id.startsWith(key) : c.id === key));
    if (match?.nextAction && ACTIONABLE.has(match.status)) return match.nextAction;
  }
  return undefined;
}

/** The pure envelope over evaluated checks: schema version, summary counts, and the highest-priority pending action. Never throws. */
export function assembleReport(
  session: Pick<ProbeSession, 'mode' | 'stackState'>,
  checks: Check[],
): Omit<StatusReport, 'generatedAt'> {
  const summary: Record<CheckStatus, number> = { ok: 0, warn: 0, missing: 0, unknown: 0, error: 0 };
  for (const item of checks) summary[item.status]++;
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    mode: session.mode,
    stackState: session.stackState,
    checks,
    nextAction: pickNextAction(checks),
    summary,
  };
}

/** Gather every provider in parallel and assemble the report. A gather failure degrades that domain to its undefined-facts evaluation. */
export async function buildStatusReport(session: ProbeSession): Promise<StatusReport> {
  const checks = (
    await Promise.all(
      statusProviders.map(async (provider) => {
        const facts = await provider.gather(session).catch(() => undefined);
        return provider.evaluate(facts, session);
      }),
    )
  ).flat();
  return { ...assembleReport(session, checks), generatedAt: new Date().toISOString() };
}
