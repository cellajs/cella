import type { Check, CheckStatus, NextAction, StatusInputs, StatusReport } from './types';
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

function toolingChecks(inputs: StatusInputs): Check[] {
  const checks: Check[] = [];
  checks.push(
    inputs.tooling.pulumi
      ? { id: 'tooling.pulumi', title: 'Pulumi CLI', status: 'ok', detail: 'installed', credential: 'none' }
      : {
          id: 'tooling.pulumi',
          title: 'Pulumi CLI',
          status: 'error',
          detail: 'not found on PATH; every stack operation needs it',
          credential: 'none',
          nextAction: installPulumi,
        },
  );
  checks.push(
    inputs.tooling.dockerBuildx
      ? { id: 'tooling.docker', title: 'Docker buildx', status: 'ok', detail: 'available', credential: 'none' }
      : {
          id: 'tooling.docker',
          title: 'Docker buildx',
          status: 'warn',
          detail: 'not found; local `deploy --build` unavailable (CI builds still work)',
          credential: 'none',
        },
  );
  checks.push(
    inputs.tooling.gh
      ? { id: 'tooling.gh', title: 'GitHub CLI', status: 'ok', detail: 'authenticated', credential: 'none' }
      : {
          id: 'tooling.gh',
          title: 'GitHub CLI',
          status: 'warn',
          detail: 'not authenticated; Environment secret sync is skipped (set them by hand)',
          credential: 'none',
        },
  );
  return checks;
}

function configChecks(inputs: StatusInputs): Check[] {
  const checks: Check[] = [];
  const stateCheck: Check = { id: 'config.stackState', title: 'Stack', status: 'ok', detail: '', credential: 'none' };
  if (inputs.stackState === 'fresh') {
    Object.assign(stateCheck, {
      status: 'missing',
      detail: `no Pulumi.${inputs.mode}.yaml; this stack has not been set up`,
      nextAction: runSetup,
    });
  } else if (inputs.stackState === 'partial') {
    Object.assign(stateCheck, {
      status: 'warn',
      detail: 'stack file exists but bootstrap is incomplete (no CI deploy key)',
      nextAction: runSetup,
    });
  } else {
    stateCheck.detail = `bootstrapped (${inputs.mode})`;
  }
  checks.push(stateCheck);

  if (inputs.stackState === 'bootstrapped') {
    checks.push(
      inputs.computeDeferredSince
        ? {
            id: 'config.computeDeferred',
            title: 'Compute',
            status: 'warn',
            detail: `deferred since ${inputs.computeDeferredSince}; the first deploy brings the VMs up`,
            credential: 'none',
            nextAction: deployAction(inputs.mode),
          }
        : {
            id: 'config.computeDeferred',
            title: 'Compute',
            status: 'ok',
            detail: 'declared (not deferred)',
            credential: 'none',
          },
    );
  }
  return checks;
}

function identityChecks(inputs: StatusInputs): Check[] {
  const checks: Check[] = [];
  checks.push(
    inputs.projectId
      ? {
          id: 'identity.project',
          title: 'Scaleway project',
          status: 'ok',
          detail: inputs.projectId,
          credential: 'none',
        }
      : {
          id: 'identity.project',
          title: 'Scaleway project',
          status: 'missing',
          detail: 'SCW_PROJECT_ID not set; setup picks or creates the project',
          credential: 'none',
          nextAction: runSetup,
        },
  );
  if (inputs.stackState === 'bootstrapped') {
    checks.push(
      inputs.adminAppId
        ? { id: 'identity.adminApp', title: 'Admin app', status: 'ok', detail: inputs.adminAppId, credential: 'none' }
        : {
            id: 'identity.adminApp',
            title: 'Admin app',
            status: 'warn',
            detail: 'SCW_ADMIN_APPLICATION_ID not set; admin bucket access needs it',
            credential: 'none',
            nextAction: runSetup,
          },
    );
  }
  return checks;
}

function githubCheck(inputs: StatusInputs): Check[] {
  const gh = inputs.github;
  if (!gh?.authenticated) {
    return [
      {
        id: 'github.environment',
        title: 'GitHub Environment',
        status: 'unknown',
        detail: 'gh not authenticated; cannot verify Environment secrets',
        credential: 'none',
      },
    ];
  }
  if (!gh.repo) {
    return [
      {
        id: 'github.environment',
        title: 'GitHub Environment',
        status: 'warn',
        detail: 'origin is not a GitHub remote; CI deploys are unavailable',
        credential: 'none',
      },
    ];
  }
  const missing = gh.missingSecrets ?? [];
  if (!gh.environmentExists) {
    return [
      {
        id: 'github.environment',
        title: 'GitHub Environment',
        status: 'missing',
        detail: `no "${inputs.mode}" Environment in ${gh.repo}; CI cannot deploy`,
        credential: 'none',
        nextAction: runSetup,
      },
    ];
  }
  if (missing.length > 0) {
    return [
      {
        id: 'github.environment',
        title: 'GitHub Environment',
        status: 'missing',
        detail: `${gh.repo} "${inputs.mode}" is missing secret(s): ${missing.join(', ')}`,
        credential: 'none',
        nextAction: runSetup,
      },
    ];
  }
  return [
    {
      id: 'github.environment',
      title: 'GitHub Environment',
      status: 'ok',
      detail: `${gh.repo} "${inputs.mode}" secrets present`,
      credential: 'none',
    },
  ];
}

/** Build a `scaleway`-tier check, short-circuiting to `unknown` without creds. */
function scalewayCheck(inputs: StatusInputs, id: string, title: string, evaluate: () => Check): Check {
  if (!inputs.credentialsAvailable) {
    return {
      id,
      title,
      status: 'unknown',
      detail: 'no SCW_*/AWS_* credentials available to this run',
      credential: 'scaleway',
    };
  }
  return evaluate();
}

function stateChecks(inputs: StatusInputs): Check[] {
  const bucket = scalewayCheck(inputs, 'state.bucket', 'State bucket', () => {
    if (inputs.stateBucketExists === undefined)
      return {
        id: 'state.bucket',
        title: 'State bucket',
        status: 'unknown',
        detail: 'could not read the state bucket',
        credential: 'scaleway',
      };
    return inputs.stateBucketExists
      ? { id: 'state.bucket', title: 'State bucket', status: 'ok', detail: 'present', credential: 'scaleway' }
      : {
          id: 'state.bucket',
          title: 'State bucket',
          status: 'missing',
          detail: 'absent; run setup to create it',
          credential: 'scaleway',
          nextAction: runSetup,
        };
  });

  const lock = scalewayCheck(inputs, 'state.lock', 'Stack lock', () => {
    if (inputs.lock === undefined)
      return {
        id: 'state.lock',
        title: 'Stack lock',
        status: 'unknown',
        detail: 'could not read the lock object',
        credential: 'scaleway',
      };
    if (!inputs.lock.held)
      return { id: 'state.lock', title: 'Stack lock', status: 'ok', detail: 'unlocked', credential: 'scaleway' };
    const who = `${inputs.lock.owner ?? 'unknown'} (${inputs.lock.operation ?? 'unknown op'})`;
    return inputs.lock.stale
      ? {
          id: 'state.lock',
          title: 'Stack lock',
          status: 'warn',
          detail: `stale lock held by ${who}, expired ${inputs.lock.expiresAt ?? '?'}`,
          credential: 'scaleway',
          nextAction: unlock,
        }
      : {
          id: 'state.lock',
          title: 'Stack lock',
          status: 'warn',
          detail: `locked by ${who} since ${inputs.lock.acquiredAt ?? '?'} (a run may be in progress)`,
          credential: 'scaleway',
        };
  });

  const rollout = scalewayCheck(inputs, 'rollout', 'Rollout', () => {
    if (inputs.rollout === undefined)
      return {
        id: 'rollout',
        title: 'Rollout',
        status: 'unknown',
        detail: 'could not read the control object',
        credential: 'scaleway',
      };
    if (inputs.rollout.length === 0)
      return {
        id: 'rollout',
        title: 'Rollout',
        status: 'missing',
        detail: 'no services deployed yet',
        credential: 'scaleway',
        nextAction: deployAction(inputs.mode),
      };
    const active = inputs.rollout.filter((r) => r.activeSha);
    const pending = inputs.rollout.filter((r) => r.pendingSha);
    if (active.length === 0)
      return {
        id: 'rollout',
        title: 'Rollout',
        status: 'missing',
        detail: 'no active generation for any service',
        credential: 'scaleway',
        nextAction: deployAction(inputs.mode),
      };
    const summary = inputs.rollout
      .map((r) => `${r.slug}=${r.activeSha ? short(r.activeSha) : '-'}${r.pendingSha ? `→${short(r.pendingSha)}` : ''}`)
      .join(' ');
    return pending.length > 0
      ? {
          id: 'rollout',
          title: 'Rollout',
          status: 'warn',
          detail: `pending rollout: ${summary}`,
          credential: 'scaleway',
          nextAction: deployAction(inputs.mode),
        }
      : { id: 'rollout', title: 'Rollout', status: 'ok', detail: summary, credential: 'scaleway' };
  });

  return [bucket, lock, rollout];
}

function secretChecks(inputs: StatusInputs): Check[] {
  return [
    scalewayCheck(inputs, 'secrets.required', 'Runtime secrets', () => {
      if (inputs.requiredSecretsMissing === undefined)
        return {
          id: 'secrets.required',
          title: 'Runtime secrets',
          status: 'unknown',
          detail: 'could not read Secret Manager',
          credential: 'scaleway',
        };
      return inputs.requiredSecretsMissing.length === 0
        ? {
            id: 'secrets.required',
            title: 'Runtime secrets',
            status: 'ok',
            detail: 'all required secrets set',
            credential: 'scaleway',
          }
        : {
            id: 'secrets.required',
            title: 'Runtime secrets',
            status: 'missing',
            detail: `unset required secret(s): ${inputs.requiredSecretsMissing.join(', ')}`,
            credential: 'scaleway',
            nextAction: manageSecrets,
          };
    }),
  ];
}

function liveChecks(inputs: StatusInputs): Check[] {
  if (!inputs.live) return [];
  return inputs.live.map((svc): Check => {
    const id = `live.${svc.slug}`;
    const title = `Service ${svc.slug}`;
    if (!svc.probe)
      return { id, title, status: 'unknown', detail: `not probed (${svc.healthUrl})`, credential: 'none' };
    const reachable = svc.probe.status === 200 || svc.probe.status === 204;
    if (!reachable) {
      const how = svc.probe.status === 0 ? 'unreachable' : `unhealthy (HTTP ${svc.probe.status})`;
      return {
        id,
        title,
        status: 'missing',
        detail: `${how} at ${svc.healthUrl}`,
        credential: 'none',
        nextAction: diagAction(inputs.mode),
      };
    }
    const served = svc.probe.version ?? '<none>';
    if (svc.expectedSha && svc.probe.version !== svc.expectedSha) {
      return {
        id,
        title,
        status: 'warn',
        detail: `serving ${short(served)}, expected ${short(svc.expectedSha)}`,
        credential: 'none',
        nextAction: deployAction(inputs.mode),
      };
    }
    return {
      id,
      title,
      status: 'ok',
      detail: `serving ${served === '<none>' ? served : short(served)}`,
      credential: 'none',
    };
  });
}

function dnsCheck(inputs: StatusInputs): Check[] {
  if (!inputs.hasDomain || !inputs.dns) return [];
  const { host, resolvedIps } = inputs.dns;
  if (resolvedIps === undefined)
    return [{ id: 'dns.zone', title: 'DNS', status: 'unknown', detail: `did not resolve ${host}`, credential: 'none' }];
  if (resolvedIps.length === 0)
    return [
      {
        id: 'dns.zone',
        title: 'DNS',
        status: 'warn',
        detail: `${host} does not resolve (NXDOMAIN); certificate issuance and traffic need it`,
        credential: 'none',
        nextAction: runSetup,
      },
    ];
  return [
    { id: 'dns.zone', title: 'DNS', status: 'ok', detail: `${host} → ${resolvedIps.join(', ')}`, credential: 'none' },
  ];
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
