import { principalNames } from '../../scaleway/principals';
import { findApplicationIdByName, resolveOrganizationId } from '../../scaleway/scaleway-iam';
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
          ? compute.warn(
              `deferred since ${session.computeDeferredSince}; the first deploy brings the VMs up`,
              deployAction(session.mode),
            )
          : compute.ok('declared (not deferred)'),
      );
    }
    return checks;
  },
};

/** Resolved admin application id, or `null` when the app does not exist. `undefined` facts mean the probe could not run. */
export type IdentityFacts = { adminAppId: string | null };

/**
 * Scaleway project + admin-app identity checks. The project id is a session fact; the admin application is resolved from
 * IAM by its canonical per-mode name, the same lookup `pulumi up` does, so status reports what the next up will actually see.
 */
export const identityProvider: StatusProvider<IdentityFacts> = {
  domain: 'identity',
  async gather(session) {
    if (session.stackState !== 'bootstrapped') return undefined;
    if (!session.credentialsAvailable || !session.secretKey || !session.projectId) return undefined;
    try {
      // `SCW_ORGANIZATION_ID` is the name the env files and GitHub Environment use; accept it before falling back to the
      // Account API, which no engine principal is granted (an unresolvable org degrades the check to unknown, never an error).
      const organizationId =
        process.env.SCW_DEFAULT_ORGANIZATION_ID?.trim() ||
        process.env.SCW_ORGANIZATION_ID?.trim() ||
        (await resolveOrganizationId(session.secretKey, session.projectId));
      const name = principalNames(session.appConfig.slug, session.mode).admin;
      return { adminAppId: (await findApplicationIdByName(session.secretKey, organizationId, name)) ?? null };
    } catch {
      return undefined;
    }
  },
  evaluate(facts, session) {
    const project = check('identity.project', 'Scaleway project');
    const checks = [
      session.projectId
        ? project.ok(session.projectId)
        : project.missing('SCW_PROJECT_ID not set; setup picks or creates the project', runSetup),
    ];
    if (session.stackState === 'bootstrapped') {
      const admin = check('identity.adminApp', 'Admin app', 'scaleway');
      checks.push(
        probed(admin, session.credentialsAvailable, facts, 'could not read IAM applications', ({ adminAppId }) =>
          adminAppId
            ? admin.ok(adminAppId)
            : admin.warn(
                `IAM application '${principalNames(session.appConfig.slug, session.mode).admin}' not found; admin bucket access needs it`,
                runSetup,
              ),
        ),
      );
    }
    return checks;
  },
};
