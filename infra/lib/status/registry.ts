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

/**
 * The registered status providers, in report order. Each owns its domain's
 * gather + evaluate; the engine here owns the envelope, the summary, and the
 * cross-domain next-action priority, knowledge no single provider can hold.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous provider fact types collapse at the registry boundary
export const statusProviders: readonly StatusProvider<any>[] = [
  toolingProvider,
  stackProvider,
  identityProvider,
  githubProvider,
  stateProvider,
  secretsProvider,
  liveProvider,
  dnsProvider,
  storesProvider,
];

/**
 * Priority order for the single top-level `nextAction`: the earliest
 * problematic check in this list wins. Roughly the setup → deploy → operate
 * lifecycle, so the surfaced step is always the next one that unblocks the
 * rest. Prefix entries (trailing `.`) match by id prefix.
 */
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

/**
 * The pure envelope over evaluated checks: schema version, summary counts,
 * and the highest-priority pending action. Total: never throws.
 */
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

/**
 * Gather every provider in parallel (a gather failure degrades that domain to
 * its undefined-facts evaluation, never a throw) and assemble the report.
 */
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
