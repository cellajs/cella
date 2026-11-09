import { actionLabel, MENU_ROWS } from '../operator-actions';
import type { RunRecord } from './run-record';

/** How a run that did not deploy ended, for a person: whose side it is on. */
export interface FailureClass {
  side: 'platform' | 'release' | 'settings' | 'unknown';
  /** What happened and what to read or do next, in plain words. */
  sentence: string;
  /** True when starting the same target again usually passes. */
  retryLikely: boolean;
}

/** The 5xx status of a failed Scaleway call in a run's error, as `scwFetch` throws it: the machine that call was making was never made. */
export function scalewayStatus(error: string | undefined): string | undefined {
  return error ? /Scaleway \S+ \S+ → (5\d\d)/.exec(error)?.[1] : undefined;
}

const SHORTAGE = /out of stock|scarce/i;

/** The steps that fail when a new machine fetches its env file or images through a link that already expired. */
const LINK_STEPS = new Set(['Compose runtime env', 'Switch machines']);

/** The words that name a shortage: the API's own message when the error carries one, else the clause around the match. */
function shortageWords(error: string): string {
  const message = /"message"\s*:\s*"([^"]+)"/.exec(error)?.[1];
  if (message && SHORTAGE.test(message)) return message;
  return (error.split(/[;\n]|: /).find((clause) => SHORTAGE.test(clause)) ?? error).trim().slice(0, 80);
}

/** The env vars a blocked run's error says hold no value, without their secret names; none for another error. */
export function blockedValues(error: string | undefined): string[] {
  const list = /required runtime values are not set: ([^;\n]+?)(?:\.(?:\s|$)|;|$)/m.exec(error ?? '')?.[1];
  return list ? list.split(',').flatMap((name) => name.replace(/\[[^\]]*\]/, '').trim() || []) : [];
}

/**
 * Whose side a run's end is on, by its outcome, failed step, error and boot accounts, the first rule that matches deciding: a value or
 * an apply the operator owes, Scaleway failing under the deploy, the release's build or boot, or not known.
 */
export function classifyRun(record: RunRecord): FailureClass {
  const { outcome, failedStep, error = '' } = record;
  const theRun = `${actionLabel('runs')} → the run`;
  if (outcome === 'blocked') {
    const names = blockedValues(error);
    const what = names.length > 0 ? `Waiting for ${names.join(', ')}` : 'A value is missing: the record names it';
    return { side: 'settings', sentence: `${what}: "${actionLabel('secrets')}" stores it and deploys again.`, retryLikely: false };
  }
  if (outcome === 'apply needed') {
    return {
      side: 'settings',
      sentence: `The release changes the infrastructure: it waits for your go (${MENU_ROWS.changes.label}).`,
      retryLikely: false,
    };
  }
  const status = scalewayStatus(error);
  if (status) {
    const during = failedStep ? `"${failedStep}"` : 'the deploy';
    return {
      side: 'platform',
      sentence: `Scaleway's API failed (${status}) during ${during}. Your code never ran there, and a retry usually passes.`,
      retryLikely: true,
    };
  }
  if (/quota/i.test(error)) {
    return {
      side: 'platform',
      sentence:
        "Your Scaleway account's quota for that machine type is reached: ask for more in the console (Organization → Quotas), then deploy again.",
      retryLikely: false,
    };
  }
  if (SHORTAGE.test(error)) {
    return {
      side: 'platform',
      sentence: `Scaleway had no machine of that type ("${shortageWords(error)}"): a retry in a few minutes usually passes.`,
      retryLikely: true,
    };
  }
  if (/\b403\b/.test(error) && LINK_STEPS.has(failedStep ?? '') && /fetch-env|load-images|link/.test(error)) {
    return {
      side: 'platform',
      sentence: 'The machine took longer to boot than its download links lasted: a retry usually passes.',
      retryLikely: true,
    };
  }
  if (failedStep === 'Build the release') {
    return { side: 'release', sentence: `The build of this release failed: read the builder's report (${theRun}).`, retryLikely: false };
  }
  const crashed = failedStep === 'Switch machines' ? record.boot?.find((entry) => entry.failed) : undefined;
  if (crashed) {
    return {
      side: 'release',
      sentence: `The new ${crashed.service} machine crashed at boot: its boot log says where (${theRun}).`,
      retryLikely: false,
    };
  }
  const silent = failedStep === 'Switch machines' ? record.boot?.find((entry) => !entry.key) : undefined;
  if (silent) {
    return {
      side: 'unknown',
      sentence: `The new ${silent.service} machine never answered the health check: almost always a crash at boot. Its serial console in the Scaleway console says how far it got.`,
      retryLikely: false,
    };
  }
  if (failedStep === 'Smoke tests') {
    return {
      side: 'release',
      sentence: `The release serves, but the smoke tests failed on it: their report says which check (${theRun}).`,
      retryLikely: false,
    };
  }
  const [firstLine] = error.trim().split('\n');
  return { side: 'unknown', sentence: firstLine || 'no error recorded', retryLikely: false };
}
