import { spawnSync } from 'node:child_process';
import { parseGithubOriginRepo } from '../../github-sync';
import { infraDir } from '../../utils/paths';
import { check, runSetup } from '../check';
import type { StatusProvider } from '../types';
import { hasTool } from './tooling';

/** GitHub Environment secrets a deploy needs; mirrors github-sync's write set. */
const REQUIRED_ENV_SECRETS = [
  'SCW_ACCESS_KEY',
  'SCW_SECRET_KEY',
  'SCW_PROJECT_ID',
  'SCW_ORGANIZATION_ID',
  'PULUMI_CONFIG_PASSPHRASE',
];

/** GitHub Environment facts, gathered via `gh` when authenticated. */
export interface GithubFacts {
  authenticated: boolean;
  /** `owner/repo`, or undefined when origin is not a GitHub remote. */
  repo?: string;
  /** undefined when not checked (gh absent). */
  environmentExists?: boolean;
  /** Names of required Environment secrets that are absent. */
  missingSecrets?: string[];
}

export const githubProvider: StatusProvider<GithubFacts> = {
  domain: 'github',
  async gather(session) {
    if (!hasTool('gh', ['auth', 'status'])) return { authenticated: false };
    const origin =
      spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: infraDir, encoding: 'utf8' }).stdout?.trim() ?? '';
    const repo = parseGithubOriginRepo(origin);
    if (!repo) return { authenticated: true };
    const envRes = spawnSync('gh', ['api', `repos/${repo}/environments/${session.mode}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const environmentExists = envRes.status === 0;
    let missingSecrets: string[] | undefined;
    if (environmentExists) {
      const secRes = spawnSync(
        'gh',
        ['api', `repos/${repo}/environments/${session.mode}/secrets`, '--jq', '.secrets[].name'],
        { encoding: 'utf8' },
      );
      if (secRes.status === 0) {
        const present = new Set(
          (secRes.stdout ?? '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        );
        missingSecrets = REQUIRED_ENV_SECRETS.filter((name) => !present.has(name));
      }
    }
    return { authenticated: true, repo, environmentExists, missingSecrets };
  },
  evaluate(facts, session) {
    const env = check('github.environment', 'GitHub Environment');
    if (!facts?.authenticated) return [env.unknown('gh not authenticated; cannot verify Environment secrets')];
    if (!facts.repo) return [env.warn('origin is not a GitHub remote; CI deploys are unavailable')];
    if (!facts.environmentExists)
      return [env.missing(`no "${session.mode}" Environment in ${facts.repo}; CI cannot deploy`, runSetup)];
    const missing = facts.missingSecrets ?? [];
    if (missing.length > 0)
      return [env.missing(`${facts.repo} "${session.mode}" is missing secret(s): ${missing.join(', ')}`, runSetup)];
    return [env.ok(`${facts.repo} "${session.mode}" secrets present`)];
  },
};
