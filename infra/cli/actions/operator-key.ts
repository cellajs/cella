import { confirm } from '@inquirer/prompts';
import { deriveInfra } from '../../lib/naming';
import { actionLabel } from '../../lib/operator-actions';
import { allPrincipalNames, appPrincipalNames } from '../../lib/scaleway/principals';
import { projectsOfOtherModes } from '../../lib/stack/project-per-mode';
import { checkMark, crossMark, pc } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { type OperatorsResult, setupOperators } from '../../tasks/setup-operators';
import { endAction, type InfraContext } from '../shared';
import { oneDayKeyHowto } from './operator-unlock';
import { acquireOwnerKey, type OwnerKey, printRevokeReminder } from './owner-key';

/** The environments the operators reach: the one the action runs for, then every other environment that has a project on this machine. */
export function operatorReach(mode: string, projectId: string, others: ReadonlyMap<string, string>): Array<{ mode: string; projectId: string }> {
  return [{ mode, projectId }, ...[...others].filter(([id]) => id !== projectId).map(([id, other]) => ({ mode: other, projectId: id }))];
}

/**
 * Write the app's operators with an Owner key the caller holds: the operator application, the operators group and a policy for each, over
 * `reach` and every project the operator policy reaches today, one that no environment file on this machine names included.
 */
async function writeOperators(
  context: InfraContext,
  ownerKey: OwnerKey,
  reach: ReadonlyArray<{ mode: string; projectId: string }>,
): Promise<OperatorsResult> {
  const { appConfig, projectId } = context;
  try {
    return await setupOperators({
      callerSecretKey: ownerKey.secretKey,
      organizationId: ownerKey.organizationId,
      projectId,
      projectIds: reach.map((entry) => entry.projectId),
      slug: appConfig.appSlug,
      dnsZone: deriveInfra(appConfig).dnsZone,
    });
  } catch (error) {
    console.error(`${crossMark} The operators were not set up: ${errorMessage(error)}`);
    return endAction(1);
  }
}

/**
 * Set up the app's operators: the `<app>-operator` application and the `<app>-operators` group, each with a policy that holds every
 * product of the app's projects and no condition. No key is made or shown: a person makes a one-day key in the console at each sitting.
 * A run rewrites both policies in place, so the caller is the organization Owner (or another IAMManager principal); a new environment is
 * added by its setup.
 */
export async function runOperatorKey(context: InfraContext): Promise<void> {
  const { appConfig, projectId } = context;
  const mode = context.environment;
  const names = allPrincipalNames(appConfig, mode);
  const reach = operatorReach(mode, projectId, projectsOfOtherModes(mode));
  console.info(
    pc.dim(
      `\n${actionLabel('operator-key')}: the '${names.operator}' application and the '${names.operators}' group, with a policy each and no key.\n`,
    ),
  );
  console.info(`They work in ${reach.map((entry) => `${pc.cyan(entry.mode)} ${pc.dim(`(project ${entry.projectId})`)}`).join(' and ')}.`);
  console.info(pc.dim('  An environment is listed once its setup named a project on this machine (infra/.env.<mode>).'));
  console.info(pc.dim('  The policies are written in place: a key of either keeps working.\n'));
  if (!(await confirm({ message: `Set up the operators of ${appConfig.appSlug}?`, default: false }))) {
    console.info('Aborted; nothing changed.');
    return;
  }
  const ownerKey = await acquireOwnerKey({ names, projectId, slug: appConfig.slug, mode });
  try {
    await writeOperators(context, ownerKey, reach);
  } finally {
    await ownerKey.release();
  }
  console.info(`\n${checkMark} ${pc.bold('The CLI asks for a one-day operator key, once per session.')} ${oneDayKeyHowto(names)}`);
  console.info(pc.dim(`  Members join '${names.operators}' in the console: IAM → Groups → ${names.operators} → Members.`));
  printRevokeReminder();
}

/**
 * Make sure the app's operators reach this environment, at an Owner moment: the application, the group and both policies are written as
 * declared, with this environment's project added to the projects they reach today, so a key of either keeps working.
 */
export async function ensureOperatorForEnvironment(context: InfraContext, ownerKey: OwnerKey, projectId: string): Promise<void> {
  const names = appPrincipalNames(context.appConfig.appSlug);
  const reach = operatorReach(context.environment, projectId, projectsOfOtherModes(context.environment));
  await writeOperators({ ...context, projectId }, ownerKey, reach);
  console.info(`  ${checkMark} '${names.operator}' and '${names.operators}' reach ${context.environment}.`);
}
