import { confirm, select } from '@inquirer/prompts';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { deleteApiKey } from '../../lib/scaleway/iam-client';
import { machinePolicies } from '../../lib/scaleway/machine-policies';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { allPrincipalNames, type PrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { createProject, listProjects } from '../../lib/scaleway/scaleway-account';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import type { Environment } from '../../lib/stack/bootstrap-stack-state';
import { projectChoices, projectsOfOtherModes } from '../../lib/stack/project-per-mode';
import { changeMark, checkMark, DIVIDER, pc, warningMark, withSpinner } from '../../lib/utils/cli-output';
import { writeModeEnvValues } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { ensureMachineIdentities } from '../../tasks/machine-identities';
import { planMachineKeys, writeMachineKeys } from '../../tasks/machine-keys';
import { writeMachinePolicies } from '../../tasks/machine-policies';
import { setupCiKey } from '../../tasks/setup-ci-key';
import { forgetOwnerKey } from '../session';
import type { CliMode, InfraContext } from '../shared';
import { autoAcceptDefaults, confirmOrDefault, inputOrDefault } from '../shared';
import { ensureObserverForEnvironment } from './observer-key';
import { ensureOperatorForEnvironment } from './operator-key';
import { acquireOwnerKey } from './owner-key';
import { rotateRunnerKey, runnerServes } from './runner';

export type SetupMode = Extract<CliMode, 'resume' | 'rotate-keys'>;

/** Result of the CI-deploy-key phase; empty strings when nothing was minted. */
export interface CiKeyResult {
  accessKey: string;
  secretKey: string;
  organizationId: string;
}

/** What an Owner moment hands to the operator part of the same run. */
export interface OwnerMomentResult {
  projectId: string;
  ciKey: CiKeyResult;
  /** The operator key, when this moment created the app's operator: the operator part runs on it without asking. */
  operatorKey?: KeyPair;
  /** True when the rotation replaced the runner key: the runner machine still holds the deleted one until it is replaced. */
  runnerKeyRotated: boolean;
}

/** Mint (or rotate) the CI deploy key, retrying on operator confirm. */
async function mintCiKey(
  ownerSecretKey: string,
  opts: { projectId: string; organizationId: string; appConfig: InfraContext['appConfig']; mode: string },
): Promise<CiKeyResult> {
  while (true) {
    try {
      const key = await setupCiKey({
        callerSecretKey: ownerSecretKey,
        organizationId: opts.organizationId,
        projectId: opts.projectId,
        slug: opts.appConfig.slug,
        mode: opts.mode,
      });
      return { accessKey: key.accessKey, secretKey: key.secretKey, organizationId: key.organizationId };
    } catch (error) {
      console.error(`\n${warningMark} CI key setup failed: ${errorMessage(error)}`);
      if (!(await confirm({ message: 'Retry?', default: true }))) return { accessKey: '', secretKey: '', organizationId: '' };
    }
  }
}

function printSummary(opts: { rotated: boolean; ciAccessKey: string; names: PrincipalNames }): void {
  const { ciAccessKey, names } = opts;
  const divider = pc.dim(DIVIDER);
  console.info(`\n${divider}`);
  if (ciAccessKey) {
    console.info(
      `${checkMark} ${pc.bold(pc.greenBright(opts.rotated ? 'Keys rotated.' : 'Identities written.'))} CI deploy key ('${names.ciDeploy}'): ${pc.cyanBright(ciAccessKey)}`,
    );
  } else {
    console.info(`${warningMark} ${pc.bold(pc.yellowBright('Done, but CI key was not created.'))} Run ${pc.cyan(actionCommand('rotate-keys'))}.`);
  }
  console.info(divider);
}

/** Offer to revoke the Owner API key typed for this moment: the last call that needs it. */
async function offerOwnerKeyRevoke(pair: KeyPair): Promise<void> {
  const revokeNow = autoAcceptDefaults()
    ? true
    : await confirm({
        message: `Revoke the Owner API key you pasted (${pair.accessKey}) now? Nothing else needs it: the rest runs on the operator key.`,
        default: true,
      });
  if (!revokeNow) {
    console.info(
      `\n${pc.dim('Reminder:')} revoke the Owner API key you pasted (${pair.accessKey}) if it was created for this setup: console → IAM → API keys.`,
    );
    return;
  }
  try {
    await withSpinner('Revoking the Owner API key', () => deleteApiKey({ secretKey: pair.secretKey }, pair.accessKey));
    forgetOwnerKey();
    console.info(`${checkMark} Key ${pair.accessKey} revoked.`);
  } catch (error) {
    console.warn(
      `${warningMark} Could not revoke the key (${errorMessage(error)}). Delete it in the console: ${pc.underline('https://console.scaleway.com/iam/api-keys')}`,
    );
  }
}

/**
 * Pick or create this environment's Scaleway project when it has none yet, using the Owner API key. Every environment has a project of its own:
 * the project of another environment is listed and cannot be taken. The chosen id is written to infra/.env.<mode> as SCW_PROJECT_ID.
 */
async function ensureProjectId(opts: { slug: string; mode: Environment; secretKey: string; organizationId: string }): Promise<string> {
  console.info(`\n→ Scaleway project for ${opts.mode} ${pc.dim('(none configured yet)')}`);
  const { organizationId } = opts;
  const projects = await withSpinner('Loading Scaleway projects', () => listProjects(opts.secretKey, organizationId));
  const CREATE = '__create__';
  const offered = projectChoices(projects, opts.slug, projectsOfOtherModes(opts.mode), CREATE);
  const choice = await select<string>({
    message: `Scaleway project for ${opts.mode}`,
    default: offered.default,
    loop: false,
    choices: offered.choices,
  });
  let projectId = choice;
  if (choice === CREATE) {
    const name = await inputOrDefault({ message: 'New project name', default: opts.slug });
    const project = await createProject(opts.secretKey, { organizationId, name, description: 'Created by the infra CLI setup wizard' });
    console.info(`  ${changeMark} Created project ${project.name} (${project.id})`);
    projectId = project.id;
  }
  writeModeEnvValues(opts.mode, { SCW_PROJECT_ID: projectId });
  process.env.SCW_PROJECT_ID = projectId;
  console.info(`  ${checkMark} SCW_PROJECT_ID written to infra/.env.${opts.mode}`);
  return projectId;
}

/**
 * The Owner moment of a setup: the project and every identity, written with an Owner API key typed at the prompt and checked as every Owner
 * action checks one, and nothing else runs on it (no Pulumi, no state, no value of the app's). The machine identities with their policies and
 * standing keys (in the deploy folder), the CI deploy key (its copy for the main job), and the app's operator and observer: created when the
 * app has none, else given this environment's project in place; the observer's key goes to this machine's env files. A rotation replaces
 * every key, the runner's too when the runner serves this environment. Undefined when declined.
 */
export async function runOwnerMoment(context: InfraContext, mode: SetupMode): Promise<OwnerMomentResult | undefined> {
  const { appConfig } = context;
  const environment = context.environment;
  const names = principalNames(appConfig.slug, environment);
  console.info(
    pc.dim(`\n→ Owner moment for ${environment}: the project and the identities, written with your Owner API key. Nothing else runs on it.`),
  );
  const ownerKey = await acquireOwnerKey({
    names: allPrincipalNames(appConfig, environment),
    projectId: context.projectId || undefined,
    slug: appConfig.slug,
    mode: environment,
  });
  const { organizationId } = ownerKey;
  const pair: KeyPair = { accessKey: ownerKey.accessKey, secretKey: ownerKey.secretKey };
  const projectId =
    context.projectId || (await ensureProjectId({ slug: appConfig.slug, mode: environment, secretKey: pair.secretKey, organizationId }));
  const proceedWith = mode === 'rotate-keys' ? actionLabel('rotate-keys') : `the identities of ${environment}`;
  if (!(await confirmOrDefault({ message: `Proceed with ${proceedWith}?`, default: true }))) return undefined;

  console.info('\n→ Machine identities (one application per registry service, and the boot fetcher, each with a standing key)');
  try {
    const registry = { slug: appConfig.slug, mode: environment };
    await ensureMachineIdentities({ ...registry, callerSecretKey: pair.secretKey, projectId, organizationId });
    console.info('\n→ Machine policies');
    await writeMachinePolicies({ secretKey: pair.secretKey }, organizationId, machinePolicies(appConfig, projectId));
    // The standing keys go to the deploy folder, which a deploy hands over from; a rotation makes every one anew.
    console.info('\n→ Standing machine keys');
    const auth = { secretKey: pair.secretKey };
    const secrets = createSecretManagerClient({ secretKey: pair.secretKey, region: appConfig.s3.region, projectId });
    const planned = await planMachineKeys({ auth, secrets, organizationId, ...registry });
    const steps = mode === 'rotate-keys' ? planned.map((step) => ({ ...step, change: 'make' as const })) : planned;
    await writeMachineKeys({ auth, secrets, organizationId, projectId, ...registry, steps });
  } catch (error) {
    console.warn(`${warningMark} Machine identities incomplete: ${errorMessage(error)}. Run \`${actionCommand('identity')}\`.`);
  }

  console.info('\n→ CI deploy key');
  const ciKey = await mintCiKey(pair.secretKey, { projectId, organizationId, appConfig, mode: environment });
  console.info('\n→ Operator');
  const operatorKey = await ensureOperatorForEnvironment({ ...context, projectId }, ownerKey, projectId);

  // A new observer reaches the projects the operator does, so it follows the operator.
  console.info('\n→ Observer');
  await ensureObserverForEnvironment({ ...context, projectId }, ownerKey, projectId, { rotate: mode === 'rotate-keys' }).catch((error) =>
    console.warn(`${warningMark} Observer incomplete: ${errorMessage(error)}. Run \`${actionCommand('identity')}\`.`),
  );

  // The runner key starts this environment's deploys, so after a compromise it goes with the rest; the operator part replaces the machine.
  let runnerKeyRotated = false;
  const { naming, region } = deriveInfra(appConfig);
  if (mode === 'rotate-keys' && runnerServes({ projectId, definition: naming.resource('main') })) {
    console.info('\n→ Runner key');
    try {
      const replaced = await rotateRunnerKey(ownerKey, { appSlug: appConfig.appSlug, region });
      console.info(`  ${changeMark} A new runner key replaced ${replaced} key(s); the runner machine is replaced next, on the operator key.`);
      runnerKeyRotated = true;
    } catch (error) {
      console.warn(`${warningMark} Runner key not rotated: ${errorMessage(error)}. Run \`${actionCommand('rotate-keys')}\` again.`);
    }
  }

  printSummary({ rotated: mode === 'rotate-keys', ciAccessKey: ciKey.accessKey, names });
  // Revoking is the moment's last call: a key may delete itself, and nothing after this needs it.
  await offerOwnerKeyRevoke(pair);
  return { projectId, ciKey, operatorKey, runnerKeyRotated };
}
