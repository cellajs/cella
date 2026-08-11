import { check, deployAction, runSetup } from '../check';
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

/** Scaleway project + admin-app identity checks; facts live on the session. */
export const identityProvider: StatusProvider<Record<string, never>> = {
  domain: 'identity',
  async gather() {
    return {};
  },
  evaluate(_facts, session) {
    const project = check('identity.project', 'Scaleway project');
    const checks = [
      session.projectId
        ? project.ok(session.projectId)
        : project.missing('SCW_PROJECT_ID not set; setup picks or creates the project', runSetup),
    ];
    if (session.stackState === 'bootstrapped') {
      const admin = check('identity.adminApp', 'Admin app');
      checks.push(
        session.adminAppId
          ? admin.ok(session.adminAppId)
          : admin.warn('SCW_ADMIN_APPLICATION_ID not set; admin bucket access needs it', runSetup),
      );
    }
    return checks;
  },
};
