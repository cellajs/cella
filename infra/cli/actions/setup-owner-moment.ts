import { confirm, select } from '@inquirer/prompts';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { declaresUploads, uploadsPolicy } from '../../lib/scaleway/declared-identities';
import { deleteApiKey } from '../../lib/scaleway/iam-client';
import type { KeyPair } from '../../lib/scaleway/operator-identity';
import { allPrincipalNames, type PrincipalNames, principalNames } from '../../lib/scaleway/principals';
import { createProject, listProjects } from '../../lib/scaleway/scaleway-account';
import { ensureApplication } from '../../lib/scaleway/scaleway-iam';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import type { Environment } from '../../lib/stack/bootstrap-stack-state';
import { projectChoices, projectsOfOtherModes } from '../../lib/stack/project-per-mode';
import { changeMark, checkMark, DIVIDER, pc, warningMark, withSpinner } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { writeDeclaredPolicies } from '../../tasks/declared-policies';
import { setupCiKey } from '../../tasks/setup-ci-key';
import { planUploadsKey, writeUploadsKey } from '../../tasks/uploads-key';
import { forgetOwnerKey } from '../session';
import type { CliMode, InfraContext } from '../shared';
import { autoAcceptDefaults, confirmOrDefault, inputOrDefault } from '../shared';
import { ensureObserverForEnvironment } from './observer-key';
import { ensureOperatorForEnvironment } from './operator-key';
import { acquireOwnerKey } from './owner-key';

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
}

/** Mint (or rotate) the deploy key, retrying on operator confirm. */
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
      `${checkMark} ${pc.bold(pc.greenBright(opts.rotated ? 'Keys rotated.' : 'Identities written.'))} Deploy key ('${names.ciDeploy}'): ${pc.cyanBright(ciAccessKey)}`,
    );
  } else {
    console.info(
      `${warningMark} ${pc.bold(pc.yellowBright('Done, but the deploy key was not created.'))} Run ${pc.cyan(actionCommand('rotate-keys'))}.`,
    );
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
 * the project of another environment is listed and cannot be taken. The stack file gets the chosen id once the stack exists, later in this run.
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
  process.env.SCW_DEFAULT_PROJECT_ID = projectId;
  return projectId;
}

/**
 * The Owner moment of a setup: the project and every identity, written with an Owner API key typed at the prompt and checked as every Owner
 * action checks one, and nothing else runs on it (no Pulumi, no state, no value of the app's). The uploads application with its policy and
 * key (in the runtime folder), the deploy key (its copy for the main job), and the app's operators and observer: created when the app has
 * none, else given this environment's project in place; the observer's key goes to this machine's env files. A rotation replaces the deploy
 * key and the uploads key. Undefined when declined.
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
  const question = mode === 'rotate-keys' ? `${actionLabel('rotate-keys')} of ${environment}?` : `Create ${environment}'s deploy keys?`;
  if (!(await confirmOrDefault({ message: question, default: true }))) return undefined;

  // The uploads key goes to the runtime folder, where the deploy composes it into the backend's env file; a rotation makes it anew.
  if (declaresUploads()) {
    console.info('\n→ Uploads key');
    try {
      const registry = { slug: appConfig.slug, mode: environment };
      const auth = { secretKey: pair.secretKey };
      await ensureApplication(
        { ...registry, callerSecretKey: pair.secretKey, projectId, organizationId },
        { suffix: 'uploads', description: "The uploads key: signs the backend's uploads and presigned URLs" },
      );
      await writeDeclaredPolicies(auth, organizationId, [uploadsPolicy({ ...registry, projectId })]);
      const secrets = createSecretManagerClient({ secretKey: pair.secretKey, region: appConfig.s3.region, projectId });
      const planned = await planUploadsKey({ auth, secrets, organizationId, ...registry });
      const step = mode === 'rotate-keys' ? { ...planned, change: 'make' as const } : planned;
      await writeUploadsKey({ auth, secrets, organizationId, projectId, step });
    } catch (error) {
      console.warn(`${warningMark} Uploads key incomplete: ${errorMessage(error)}. Run \`${actionCommand('identity')}\`.`);
    }
  }

  console.info('\n→ Deploy key');
  const ciKey = await mintCiKey(pair.secretKey, { projectId, organizationId, appConfig, mode: environment });
  console.info('\n→ Operators');
  await ensureOperatorForEnvironment({ ...context, projectId }, ownerKey, projectId);

  // A new observer reaches the projects the operator does, so it follows the operator.
  console.info('\n→ Observer');
  await ensureObserverForEnvironment({ ...context, projectId }, ownerKey, projectId).catch((error) =>
    console.warn(`${warningMark} Observer incomplete: ${errorMessage(error)}. Run \`${actionCommand('identity')}\`.`),
  );

  printSummary({ rotated: mode === 'rotate-keys', ciAccessKey: ciKey.accessKey, names });
  // Revoking is the moment's last call: a key may delete itself, and nothing after this needs it.
  await offerOwnerKeyRevoke(pair);
  return { projectId, ciKey };
}
