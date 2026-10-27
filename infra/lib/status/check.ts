import { actionCommand, menuPath } from '../operator-actions';
import type { Check, CheckStatus, CredentialTier, NextAction } from './types';

/** The local setup/manage entrypoint. */
export const runSetup: NextAction = { description: 'Run the infra CLI (setup on a fresh stack, operator menu otherwise)', command: 'pnpm infra' };
export const manageSecrets: NextAction = {
  description: `Set the missing runtime secret(s) via "${menuPath('secrets')}"`,
  command: actionCommand('secrets'),
};
export const unlock: NextAction = {
  description: `Clear the stale stack lock via "${menuPath('unlock')}" (only when no run is in progress)`,
  command: actionCommand('unlock'),
};
export const manageDbEndpoint: NextAction = {
  description: `Close the public DB endpoint via "${menuPath('db-close')}"`,
  command: actionCommand('db-close'),
};
export const clearPending: NextAction = {
  description: `Review the interrupted Pulumi operations via "${menuPath('unlock')}" (only when no run is in progress)`,
  command: actionCommand('unlock'),
};

/** Deploy the environment's target: the runner does once its target moves, this starts a run now. */
export function deployAction(mode: string): NextAction {
  return { description: `Start a run of ${mode}'s main job for its target`, command: `${actionCommand('start-deploy')} --mode ${mode}` };
}

/** Read the last runs and the machines' boot accounts when a live service is wrong, then deploy again. */
export function diagAction(mode: string): NextAction {
  return {
    description: "Read the last runs and the release's boot accounts, then start a run again",
    command: `${actionCommand('runs')} --mode ${mode} --machines`,
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
  return { ok: verdict('ok'), warn: verdict('warn'), missing: verdict('missing'), error: verdict('error'), unknown: verdict('unknown') };
}

/** Evaluate a `scaleway`-tier probe result: `unknown` without a key or
 *  when the gatherer left the value undefined (the probe could not run). */
export function probed<T>(
  builder: CheckBuilder,
  scalewayKeyAvailable: boolean,
  value: T | undefined,
  unknownDetail: string,
  evaluate: (value: T) => Check,
): Check {
  if (!scalewayKeyAvailable) return builder.unknown('no Scaleway key available to this run (SCW_OBSERVER_*, SCW_* or AWS_*)');
  if (value === undefined) return builder.unknown(unknownDetail);
  return evaluate(value);
}
