import type { Check, CheckStatus, CredentialTier, NextAction } from './types';

/** The local setup/manage entrypoint. */
export const runSetup: NextAction = {
  description: 'Run the infra CLI (setup on a fresh stack, operator menu otherwise)',
  command: 'pnpm infra',
};
export const installPulumi: NextAction = {
  description: 'Install the Pulumi CLI',
  command: 'brew install pulumi/tap/pulumi',
};
export const manageSecrets: NextAction = {
  description: 'Set the missing runtime secret(s) via "Manage runtime secrets"',
  command: 'pnpm infra',
};
export const unlock: NextAction = {
  description: 'Clear the stale stack lock via "Unlock" (only when no run is in progress)',
  command: 'pnpm infra',
};

/** Local, self-contained deploy of the current HEAD for a mode. */
export function deployAction(mode: string): NextAction {
  return {
    description: `Deploy the current commit to ${mode}`,
    command: `pnpm --filter infra run deploy --mode ${mode} --sha $(git rev-parse HEAD) --build`,
  };
}

/** Redeploy or read boot diagnostics when a live service is wrong. */
export function diagAction(mode: string): NextAction {
  return {
    description: 'Redeploy, or read boot diagnostics if it keeps failing',
    command: `pnpm --filter infra run deploy --mode ${mode} --sha $(git rev-parse HEAD) --build  # or: pnpm --filter infra diag`,
  };
}

export type Verdict = (detail: string, nextAction?: NextAction) => Check;
export interface CheckBuilder {
  ok: Verdict;
  warn: Verdict;
  missing: Verdict;
  error: Verdict;
  unknown: Verdict;
}

/** One verdict closure per status, so each check branch is a single call
 *  without repeating the object literal. */
export function check(id: string, title: string, credential: CredentialTier = 'none'): CheckBuilder {
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
export function probed<T>(
  builder: CheckBuilder,
  credentialsAvailable: boolean,
  value: T | undefined,
  unknownDetail: string,
  evaluate: (value: T) => Check,
): Check {
  if (!credentialsAvailable) return builder.unknown('no SCW_*/AWS_* credentials available to this run');
  if (value === undefined) return builder.unknown(unknownDetail);
  return evaluate(value);
}
