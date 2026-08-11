import type { Check, CheckStatus, CredentialTier, NextAction, StatusInputs, StatusReport } from './types';
import { STATUS_SCHEMA_VERSION } from './types';

/** First 7 chars of a git SHA, the length humans and logs use. */
const short = (sha: string): string => sha.slice(0, 7);

/** The local setup/manage entrypoint. */
const runSetup: NextAction = {
  description: 'Run the infra CLI (setup on a fresh stack, operator menu otherwise)',
  command: 'pnpm infra',
};
const installPulumi: NextAction = { description: 'Install the Pulumi CLI', command: 'brew install pulumi/tap/pulumi' };
const manageSecrets: NextAction = {
  description: 'Set the missing runtime secret(s) via "Manage runtime secrets"',
  command: 'pnpm infra',
};
const unlock: NextAction = {
  description: 'Clear the stale stack lock via "Unlock" (only when no run is in progress)',
  command: 'pnpm infra',
};

/** Local, self-contained deploy of the current HEAD for a mode. */
function deployAction(mode: string): NextAction {
  return {
    description: `Deploy the current commit to ${mode}`,
    command: `pnpm --filter infra run deploy --mode ${mode} --sha $(git rev-parse HEAD) --build`,
  };
}

/** Redeploy or read boot diagnostics when a live service is wrong. */
function diagAction(mode: string): NextAction {
  return {
    description: 'Redeploy, or read boot diagnostics if it keeps failing',
    command: `pnpm --filter infra run deploy --mode ${mode} --sha $(git rev-parse HEAD) --build  # or: pnpm --filter infra diag`,
  };
}

type Verdict = (detail: string, nextAction?: NextAction) => Check;
interface CheckBuilder {
  ok: Verdict;
  warn: Verdict;
  missing: Verdict;
  error: Verdict;
  unknown: Verdict;
}

/** One verdict closure per status, so each check branch is a single call
 *  instead of a repeated object literal. */
function check(id: string, title: string, credential: CredentialTier = 'none'): CheckBuilder {
  const verdict =
    (status: CheckStatus): Verdict =>
    (detail, nextAction) => ({ id, title, status, detail, credential, ...(nextAction ? { nextAction } : {}) });
  return {
    ok: verdict('ok'),
    warn: verdict('warn'),
    missing: verdict('missing'),
    error: verdict('error'),
    unknown: verdict('unknown'),
  };
}

/** Evaluate a `scaleway`-tier probe result: `unknown` without credentials or
 *  when the gatherer left the value undefined (the probe could not run). */
function probed<T>(
  builder: CheckBuilder,
  inputs: StatusInputs,
  value: T | undefined,
  unknownDetail: string,
  evaluate: (value: T) => Check,
): Check {
  if (!inputs.credentialsAvailable) return builder.unknown('no SCW_*/AWS_* credentials available to this run');
  if (value === undefined) return builder.unknown(unknownDetail);
  return evaluate(value);
}

function toolingChecks(inputs: StatusInputs): Check[] {
  const pulumi = check('tooling.pulumi', 'Pulumi CLI');
  const docker = check('tooling.docker', 'Docker buildx');
  const gh = check('tooling.gh', 'GitHub CLI');
  return [
    inputs.tooling.pulumi
      ? pulumi.ok('installed')
      : pulumi.error('not found on PATH; every stack operation needs it', installPulumi),
    inputs.tooling.dockerBuildx
      ? docker.ok('available')
      : docker.warn('not found; local `deploy --build` unavailable (CI builds still work)'),
    inputs.tooling.gh
      ? gh.ok('authenticated')
      : gh.warn('not authenticated; Environment secret sync is skipped (set them by hand)'),
  ];
}

function configChecks(inputs: StatusInputs): Check[] {
  const stack = check('config.stackState', 'Stack');
  const checks = [
    inputs.stackState === 'fresh'
      ? stack.missing(`no Pulumi.${inputs.mode}.yaml; this stack has not been set up`, runSetup)
      : inputs.stackState === 'partial'
        ? stack.warn('stack file exists but bootstrap is incomplete (no CI deploy key)', runSetup)
        : stack.ok(`bootstrapped (${inputs.mode})`),
  ];
  if (inputs.stackState === 'bootstrapped') {
    const compute = check('config.computeDeferred', 'Compute');
    checks.push(
      inputs.computeDeferredSince
        ? compute.warn(
            `deferred since ${inputs.computeDeferredSince}; the first deploy brings the VMs up`,
            deployAction(inputs.mode),
          )
        : compute.ok('declared (not deferred)'),
    );
  }
  return checks;
}

function identityChecks(inputs: StatusInputs): Check[] {
  const project = check('identity.project', 'Scaleway project');
  const checks = [
    inputs.projectId
      ? project.ok(inputs.projectId)
      : project.missing('SCW_PROJECT_ID not set; setup picks or creates the project', runSetup),
  ];
  if (inputs.stackState === 'bootstrapped') {
    const admin = check('identity.adminApp', 'Admin app');
    checks.push(
      inputs.adminAppId
        ? admin.ok(inputs.adminAppId)
        : admin.warn('SCW_ADMIN_APPLICATION_ID not set; admin bucket access needs it', runSetup),
    );
  }
  return checks;
}

function githubCheck(inputs: StatusInputs): Check[] {
  const env = check('github.environment', 'GitHub Environment');
  const gh = inputs.github;
  if (!gh?.authenticated) return [env.unknown('gh not authenticated; cannot verify Environment secrets')];
  if (!gh.repo) return [env.warn('origin is not a GitHub remote; CI deploys are unavailable')];
  if (!gh.environmentExists)
    return [env.missing(`no "${inputs.mode}" Environment in ${gh.repo}; CI cannot deploy`, runSetup)];
  const missing = gh.missingSecrets ?? [];
  if (missing.length > 0)
    return [env.missing(`${gh.repo} "${inputs.mode}" is missing secret(s): ${missing.join(', ')}`, runSetup)];
  return [env.ok(`${gh.repo} "${inputs.mode}" secrets present`)];
}

function stateChecks(inputs: StatusInputs): Check[] {
  const bucket = check('state.bucket', 'State bucket', 'scaleway');
  const lock = check('state.lock', 'Stack lock', 'scaleway');
  const rollout = check('rollout', 'Rollout', 'scaleway');
  return [
    probed(bucket, inputs, inputs.stateBucketExists, 'could not read the state bucket', (exists) =>
      exists ? bucket.ok('present') : bucket.missing('absent; run setup to create it', runSetup),
    ),
    probed(lock, inputs, inputs.lock, 'could not read the lock object', (held) => {
      if (!held.held) return lock.ok('unlocked');
      const who = `${held.owner ?? 'unknown'} (${held.operation ?? 'unknown op'})`;
      return held.stale
        ? lock.warn(`stale lock held by ${who}, expired ${held.expiresAt ?? '?'}`, unlock)
        : lock.warn(`locked by ${who} since ${held.acquiredAt ?? '?'} (a run may be in progress)`);
    }),
    probed(rollout, inputs, inputs.rollout, 'could not read the control object', (services) => {
      if (services.length === 0) return rollout.missing('no services deployed yet', deployAction(inputs.mode));
      if (!services.some((r) => r.activeSha))
        return rollout.missing('no active generation for any service', deployAction(inputs.mode));
      const summary = services
        .map(
          (r) => `${r.slug}=${r.activeSha ? short(r.activeSha) : '-'}${r.pendingSha ? `→${short(r.pendingSha)}` : ''}`,
        )
        .join(' ');
      return services.some((r) => r.pendingSha)
        ? rollout.warn(`pending rollout: ${summary}`, deployAction(inputs.mode))
        : rollout.ok(summary);
    }),
  ];
}

function secretChecks(inputs: StatusInputs): Check[] {
  const secrets = check('secrets.required', 'Runtime secrets', 'scaleway');
  return [
    probed(secrets, inputs, inputs.requiredSecretsMissing, 'could not read Secret Manager', (missing) =>
      missing.length === 0
        ? secrets.ok('all required secrets set')
        : secrets.missing(`unset required secret(s): ${missing.join(', ')}`, manageSecrets),
    ),
  ];
}

function liveChecks(inputs: StatusInputs): Check[] {
  if (!inputs.live) return [];
  return inputs.live.map((svc): Check => {
    const service = check(`live.${svc.slug}`, `Service ${svc.slug}`);
    if (!svc.probe) return service.unknown(`not probed (${svc.healthUrl})`);
    if (svc.probe.status !== 200 && svc.probe.status !== 204) {
      const how = svc.probe.status === 0 ? 'unreachable' : `unhealthy (HTTP ${svc.probe.status})`;
      return service.missing(`${how} at ${svc.healthUrl}`, diagAction(inputs.mode));
    }
    const served = svc.probe.version ?? '<none>';
    if (svc.expectedSha && svc.probe.version !== svc.expectedSha)
      return service.warn(`serving ${short(served)}, expected ${short(svc.expectedSha)}`, deployAction(inputs.mode));
    return service.ok(`serving ${served === '<none>' ? served : short(served)}`);
  });
}

function dnsCheck(inputs: StatusInputs): Check[] {
  if (!inputs.hasDomain || !inputs.dns) return [];
  const dns = check('dns.zone', 'DNS');
  const { host, resolvedIps } = inputs.dns;
  if (resolvedIps === undefined) return [dns.unknown(`did not resolve ${host}`)];
  if (resolvedIps.length === 0)
    return [dns.warn(`${host} does not resolve (NXDOMAIN); certificate issuance and traffic need it`, runSetup)];
  return [dns.ok(`${host} → ${resolvedIps.join(', ')}`)];
}

/**
 * Priority order for the single top-level `nextAction`: the earliest
 * problematic check in this list wins. Roughly the setup → deploy → operate
 * lifecycle, so the surfaced step is always the next one that unblocks the
 * rest. `live.*` ids are matched by prefix.
 */
const NEXT_ACTION_PRIORITY = [
  'tooling.pulumi',
  'identity.project',
  'config.stackState',
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
 * Turn gathered facts into the full status report. Pure and total: every field
 * left `undefined` by the gatherer becomes an `unknown` check, never a throw,
 * so a partially-credentialed run still produces a complete report.
 */
export function evaluateStatus(inputs: StatusInputs): Omit<StatusReport, 'generatedAt'> {
  const checks: Check[] = [
    ...toolingChecks(inputs),
    ...configChecks(inputs),
    ...identityChecks(inputs),
    ...githubCheck(inputs),
    ...stateChecks(inputs),
    ...secretChecks(inputs),
    ...liveChecks(inputs),
    ...dnsCheck(inputs),
  ];

  const summary: Record<CheckStatus, number> = { ok: 0, warn: 0, missing: 0, unknown: 0, error: 0 };
  for (const check of checks) summary[check.status]++;

  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    mode: inputs.mode,
    stackState: inputs.stackState,
    checks,
    nextAction: pickNextAction(checks),
    summary,
  };
}
