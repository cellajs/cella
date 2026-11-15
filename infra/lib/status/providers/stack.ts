import { listApiKeys, resolveApplicationIdByName } from '../../scaleway/iam-client';
import { organizationIdOfKey } from '../../scaleway/operator-identity';
import { allPrincipalNames } from '../../scaleway/principals';
import { projectsOfOtherModes, projectVerdict } from '../../stack/project-per-mode';
import { check, probed, runSetup } from '../check';
import type { StatusProvider } from '../types';

/** The stack file's check; every fact lives on the session. */
export const stackProvider: StatusProvider<Record<string, never>> = {
  domain: 'config',
  async gather() {
    return {};
  },
  evaluate(_facts, session) {
    const stack = check('config.stackState', 'Setup');
    return [
      session.stackState === 'fresh'
        ? stack.missing(`no Pulumi.${session.mode}.yaml; this stack has not been set up`, runSetup)
        : session.stackState === 'partial'
          ? stack.warn('stack file exists but bootstrap is incomplete (no deploy key)', runSetup)
          : { ...stack.ok(`bootstrapped (${session.mode})`), headline: `${session.mode} set up` },
    ];
  },
};

/** One key's age, by the application that bears it. */
export interface KeyAge {
  application: string;
  createdAt: string;
}

/**
 * Resolved observer application id, or `null` when the app does not exist, and the age of every key of the environment's identities.
 * `undefined` facts mean the probe could not run.
 */
export type IdentityFacts = { observerAppId: string | null; keyAges: KeyAge[] };

const ageInDays = (createdAt: string, now: number) => Math.max(0, Math.floor((now - Date.parse(createdAt)) / 86_400_000));

/** The keys' ages as one line, oldest first, in days. No age is a deadline: the line only says how old each key is. */
export function keyAgesLine(ages: readonly KeyAge[], now = Date.now()): string {
  return [...ages]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((age) => `${age.application} ${ageInDays(age.createdAt, now)} d`)
    .join(', ');
}

/** The keys as a count and the oldest one's age: `24 API keys, oldest 19 d`. */
function keyAgesHeadline(ages: readonly KeyAge[], now = Date.now()): string {
  const oldest = Math.max(...ages.map((age) => ageInDays(age.createdAt, now)));
  return `${ages.length} API key${ages.length === 1 ? '' : 's'}, oldest ${oldest} d`;
}

/**
 * Scaleway project + observer identity checks. The project id is a session fact; the observer application is resolved from
 * IAM by its canonical per-app name, the same lookup `pulumi up` does for its bucket statements.
 */
export const identityProvider: StatusProvider<IdentityFacts> = {
  domain: 'identity',
  async gather(session) {
    if (session.stackState !== 'bootstrapped') return undefined;
    if (!session.scalewayKeyAvailable || !session.accessKey || !session.secretKey || !session.projectId) return undefined;
    try {
      // An application key learns its organization from IAM; an unresolvable one degrades the check to unknown, never an error.
      const organizationId = await organizationIdOfKey({ accessKey: session.accessKey, secretKey: session.secretKey }, session.projectId);
      const auth = { secretKey: session.secretKey };
      const names = allPrincipalNames(session.appConfig, session.mode);
      const observerAppId = await resolveApplicationIdByName(auth, organizationId, names.observer);
      const applications = [names.operator, names.observer, names.ciDeploy, names.uploads, names.transloadit];
      const keyAges: KeyAge[] = [];
      for (const application of applications) {
        const id = application === names.observer ? observerAppId : await resolveApplicationIdByName(auth, organizationId, application);
        if (!id) continue;
        for (const key of await listApiKeys(auth, organizationId, id)) if (key.created_at) keyAges.push({ application, createdAt: key.created_at });
      }
      return { observerAppId, keyAges };
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    const project = check('identity.project', 'Project');
    const own = projectVerdict(session.projectId, projectsOfOtherModes(session.mode));
    const checks = [
      own.status === 'missing'
        ? project.missing(`infra/Pulumi.${session.mode}.yaml names no project; setup picks or creates one`, runSetup)
        : own.status === 'shared'
          ? project.error(`${session.projectId} is also the project of ${own.sharedWith}: every environment needs a project of its own`)
          : { ...project.ok(session.projectId ?? ''), headline: `project ${(session.projectId ?? '').slice(0, 8)}-…` },
    ];
    if (session.stackState === 'bootstrapped') {
      const ages = check('identity.keyAges', 'Key ages', 'scaleway');
      checks.push(
        probed(ages, session.scalewayKeyAvailable, facts, 'could not read the keys', ({ keyAges }) =>
          keyAges.length > 0 ? { ...ages.ok(keyAgesLine(keyAges)), headline: keyAgesHeadline(keyAges) } : ages.ok('no key found'),
        ),
      );
    }
    return checks;
  },
};
