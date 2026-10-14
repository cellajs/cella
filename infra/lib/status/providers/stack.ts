import { actionCommand } from '../../operator-actions';
import { resolveApplicationIdByName } from '../../scaleway/iam-client';
import { organizationIdOfKey } from '../../scaleway/operator-identity';
import { principalNames } from '../../scaleway/principals';
import { projectsOfOtherModes, projectVerdict } from '../../stack/project-per-mode';
import { check, deployAction, probed, runSetup } from '../check';
import type { StatusProvider } from '../types';

/** Stack-file + compute-deferral checks; every fact lives on the session. */
export const stackProvider: StatusProvider<Record<string, never>> = {
  domain: 'config',
  async gather() {
    return {};
  },
  evaluate(_facts, session) {
    const stack = check('config.stackState', 'Stack');
    const checks = [
      session.stackState === 'fresh'
        ? stack.missing(`no Pulumi.${session.mode}.yaml; this stack has not been set up`, runSetup)
        : session.stackState === 'partial'
          ? stack.warn('stack file exists but bootstrap is incomplete (no CI deploy key)', runSetup)
          : stack.ok(`bootstrapped (${session.mode})`),
    ];
    if (session.stackState === 'bootstrapped') {
      const compute = check('config.computeDeferred', 'Compute');
      checks.push(
        session.computeDeferredSince
          ? compute.warn(`deferred since ${session.computeDeferredSince}; the first deploy brings the VMs up`, deployAction(session.mode))
          : compute.ok('declared (not deferred)'),
      );
    }
    return checks;
  },
};

/** Resolved observer application id, or `null` when the app does not exist. `undefined` facts mean the probe could not run. */
export type IdentityFacts = { observerAppId: string | null };

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
      const name = principalNames(session.appConfig.slug, session.mode).observer;
      return { observerAppId: await resolveApplicationIdByName({ secretKey: session.secretKey }, organizationId, name) };
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
      const observer = check('identity.observerApp', 'Observer app', 'scaleway');
      checks.push(
        probed(observer, session.scalewayKeyAvailable, facts, 'could not read IAM applications', ({ observerAppId }) =>
          observerAppId
            ? observer.ok(observerAppId)
            : observer.warn(
                `IAM application '${principalNames(session.appConfig.slug, session.mode).observer}' not found; \`${actionCommand('identity')}\` creates it`,
                runSetup,
              ),
        ),
      );
    }
    return checks;
  },
};
