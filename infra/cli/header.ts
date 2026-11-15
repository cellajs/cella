import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Environment, StackState } from '../lib/stack/bootstrap-stack-state';
import { DIVIDER, pc } from '../lib/utils/cli-output';
import { infraDir } from '../lib/utils/paths';

/** The header's width, the same as the divider under it and the headers of cella-cli and create-cella. */
const HEADER_WIDTH = 60;

export interface HeaderFacts {
  slug: string;
  /** The release this checkout is at, left out when the root package.json names none. */
  version?: string;
  environment: Environment;
  state: StackState;
  /** The app's host, from its frontend URL. */
  host?: string;
}

/** The version in the repository's root package.json: the release this checkout is at. */
export function checkoutVersion(): string | undefined {
  try {
    const { version } = JSON.parse(readFileSync(resolve(infraDir, '..', 'package.json'), 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The two lines every run opens with: the tool and the checkout's version on the left, the environment and the app's host on the right,
 * then the divider. Production is bold red, so a run against it never looks like a staging run.
 */
export function formatHeader(facts: HeaderFacts): [string, string] {
  const left = `⧈ ${facts.slug} infra`;
  const version = facts.version ? ` · ${facts.version}` : '';
  const state = facts.state === 'bootstrapped' ? '' : facts.state === 'fresh' ? ' · new' : ' · setup not finished';
  const host = facts.host ? ` · ${facts.host}` : '';
  const padding = ' '.repeat(Math.max(1, HEADER_WIDTH - `${left}${version}${facts.environment}${state}${host}`.length));
  const mode = facts.environment === 'production' ? pc.bold(pc.red(facts.environment)) : pc.cyan(facts.environment);
  const right = `${mode}${pc.dim(state)}${facts.host ? `${pc.dim(' · ')}${pc.cyan(facts.host)}` : ''}`;
  return [`${pc.cyan(left)}${pc.dim(version)}${padding}${right}`, DIVIDER];
}
