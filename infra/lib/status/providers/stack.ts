import { listApiKeys, resolveApplicationIdByName } from '../../scaleway/iam-client';
import { machinePrincipals } from '../../scaleway/machine-keys';
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
    const stack = check('config.stackState', 'Stack');
    return [
      session.stackState === 'fresh'
        ? stack.missing(`no Pulumi.${session.mode}.yaml; this stack has not been set up`, runSetup)
        : session.stackState === 'partial'
          ? stack.warn('stack file exists but bootstrap is incomplete (no deploy key)', runSetup)
          : stack.ok(`bootstrapped (${session.mode})`),
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

/** The keys' ages as one line, oldest first, in days. No age is a deadline (D12): the line only says how old each key is. */
export function keyAgesLine(ages: readonly KeyAge[], now = Date.now()): string {
  const days = (createdAt: string) => Math.max(0, Math.floor((now - Date.parse(createdAt)) / 86_400_000));
  return [...ages]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((age) => `${age.application} ${days(age.createdAt)} d`)
    .join(', ');
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
      const applications = [
        names.operator,
        names.observer,
        names.ciDeploy,
        ...machinePrincipals(session.appConfig.slug, session.mode).map((principal) => principal.application),
      ];
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
    const project = check('identity.project', 'Scaleway project');
    const own = projectVerdict(session.projectId, projectsOfOtherModes(session.mode));
    const checks = [
      own.status === 'missing'
        ? project.missing(`SCW_PROJECT_ID not set in infra/.env.${session.mode}; setup picks or creates the project`, runSetup)
        : own.status === 'shared'
          ? project.error(`${session.projectId} is also the project of ${own.sharedWith}: every environment needs a project of its own`)
          : project.ok(session.projectId ?? ''),
    ];
    if (session.stackState === 'bootstrapped') {
      const ages = check('identity.keyAges', 'Key ages', 'scaleway');
      checks.push(
        probed(ages, session.scalewayKeyAvailable, facts, 'could not read the keys', ({ keyAges }) =>
          ages.ok(keyAges.length > 0 ? keyAgesLine(keyAges) : 'no key found'),
        ),
      );
    }
    return checks;
  },
};
