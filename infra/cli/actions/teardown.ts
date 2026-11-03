import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { input } from '@inquirer/prompts';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { describeKey } from '../../lib/scaleway/operator-identity';
import { appPrincipalNames } from '../../lib/scaleway/principals';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { makeS3Client, stateKeyOf } from '../../lib/scaleway/s3-client';
import { deleteApplicationCascade, deleteGroup, listManagedPrincipals, removeBootstrapDnsGrant } from '../../lib/scaleway/scaleway-iam';
import { createRdbClient } from '../../lib/scaleway/scaleway-rdb';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { appStorageNeeds, services } from '../../lib/services';
import { stateBucket } from '../../lib/stack/control-store';
import { type KeptResource, keptResources, keptUrns, sweptSecrets } from '../../lib/stack/kept-resources';
import { verifyStackPassphrase } from '../../lib/stack/pulumi-passphrase';
import { withoutUrns } from '../../lib/stack/retired-state';
import { checkMark, crossMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { writeEnvValues } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { shutOutOfBuckets } from '../../tasks/admit-operator-buckets';
import { builderPrefix, removeBuilderMachines } from '../../tasks/build-release';
import { writeFinalDump } from '../../tasks/final-dump';
import { readCustodiedPassphrase } from '../../tasks/passphrase-custody';
import { acquireStackLockOrExit, endAction, type InfraContext, pulumiLoginAndSelect, resolveVerifiedPassphrase, stackNameFor } from '../shared';
import { acquireIdentityKey } from './operator-unlock';
import { type OwnerKey, printRevokeReminder } from './owner-key';
import { runnerServes } from './runner';

/** The applications a cleanup may delete, apart from the one the run itself authenticates as: deleting that one revokes the key every later call needs. */
export function splitOwnApplication<App extends { id: string }>(
  applications: readonly App[],
  ownApplicationId: string | undefined,
): { own?: App; others: App[] } {
  return {
    own: applications.find((app) => app.id === ownApplicationId),
    others: applications.filter((app) => app.id !== ownApplicationId),
  };
}

/** The names of what a teardown keeps, for the lines that tell the operator. */
function keptNames(context: InfraContext, kept: readonly KeptResource[]): string {
  const live = kept.flatMap(({ adopt }) => (!adopt ? [] : 'bucket' in adopt ? [adopt.bucket] : [`/runtime/${adopt.secret}`]));
  return [...live, stateBucket(context.appConfig.slug)].join(', ');
}

/**
 * Tear an environment down in one act: the typed `<slug>-<mode>` and an Owner API key that ends within a day, and nothing else, as the Owner
 * key holds every right. Under the stack lock it deletes the builder machines, writes the final dump of the database into the private uploads
 * bucket, takes the kept resources out of the state (lib/stack/kept-resources.ts) and destroys the rest. Then it removes the stack, deletes
 * every secret container but the kept ones and the environment's identities, and leaves the project id in `infra/.env.<mode>`, where the
 * next setup finds it and adopts what was kept. A dump that fails deletes nothing.
 */
export async function runTeardown(context: InfraContext): Promise<void> {
  const { appConfig } = context;
  const confirmToken = `${appConfig.slug}-${context.environment}`;
  const kept = keptResources(appConfig);

  console.info(`\n${pc.bold(pc.redBright(actionLabel('teardown')))} ${pc.dim(`(${confirmToken})`)}\n`);
  console.info(
    pc.dim(
      'Deletes the machines, the load balancer, the network, the database after a final dump, the DNS records, the main job, the registry, the secrets and the identities of this environment.',
    ),
  );
  console.info(pc.dim(`Keeps, with their contents: ${keptNames(context, kept)}.`));

  const typed = await input({ message: `Type ${pc.bold(confirmToken)} to continue` });
  if (typed.trim() !== confirmToken) {
    console.info('Token mismatch; nothing was touched.');
    return;
  }

  const owner = await acquireIdentityKey(context, 'A teardown deletes the identities of the environment with its resources.');
  try {
    if (!(await destroyStack(context, owner, kept))) return;
    await deleteIdentities(context, owner);
  } finally {
    await owner.release();
  }
  printRevokeReminder();
}

/** The passphrase from Secret Manager, which the Owner key reads too; asked when the stored one does not open the stack. */
async function ownerPassphrase(context: InfraContext, owner: OwnerKey): Promise<string> {
  const custody = { secretKey: owner.secretKey, region: context.appConfig.s3.region, projectId: context.projectId };
  const stored = await readCustodiedPassphrase(custody).catch(() => undefined);
  if (stored && context.stackYaml && verifyStackPassphrase(context.stackYaml, stored)) return stored;
  return resolveVerifiedPassphrase(context.stackYaml);
}

/** End the action when the bucket policies do not name the Owner key's bearer: the key would then read no state and write no dump. */
async function exitWhenShutOut(context: InfraContext, owner: OwnerKey): Promise<void> {
  const self = await describeKey(owner);
  const principal = `${self.bearer === 'application' ? 'application_id' : 'user_id'}:${self.bearerId}`;
  if (!(await shutOutOfBuckets({ appConfig: context.appConfig, projectId: context.projectId, key: owner, principal }))) return;
  const names = appPrincipalNames(context.appConfig.appSlug);
  console.error(
    `${crossMark} The bucket policies of ${context.environment} do not name ${self.name}, so this key reads no state and writes no dump. Join '${names.operators}' in the console (IAM → Groups), run "${actionLabel('apply')}" so the policies name you, then tear down again. Nothing was touched.`,
  );
  endAction(1);
}

/**
 * Ready the state for the destroy, whatever options an older program recorded in it: the kept resources leave it, so they stay live, and
 * every protection is lifted, so nothing stops the destroy. Returns the names of the resources taken out.
 */
function prepareState(stack: string, env: NodeJS.ProcessEnv, kept: readonly KeptResource[]): string[] {
  const run = (args: string[]) =>
    spawnSync('pulumi', [...args, '--stack', stack], { cwd: infraDir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const exported = run(['stack', 'export']);
  if (exported.status !== 0) throw new Error(`pulumi stack export failed: ${exported.stderr.trim()}`);
  const document: unknown = JSON.parse(exported.stdout);
  const urns = keptUrns(document, kept);
  if (urns.length > 0) {
    const folder = mkdtempSync(join(tmpdir(), 'teardown-'));
    writeFileSync(join(folder, 'before.json'), exported.stdout);
    writeFileSync(join(folder, 'after.json'), JSON.stringify(withoutUrns(document, urns)));
    const imported = run(['stack', 'import', '--file', join(folder, 'after.json')]);
    if (imported.status !== 0) throw new Error(`pulumi stack import failed: ${imported.stderr.trim()} (the export before is ${folder}/before.json)`);
  }
  const unprotected = run(['state', 'unprotect', '--all', '--yes']);
  if (unprotected.status !== 0) throw new Error(`pulumi state unprotect failed: ${unprotected.stderr.trim()}`);
  return urns.map((urn) => urn.split('::').pop() ?? urn);
}

/** `pulumi destroy`, as a child that leaves the event loop free, so the stack lease keeps renewing while it runs. */
function pulumiDestroy(stack: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((done) => {
    spawn('pulumi', ['destroy', '--refresh', '--yes', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' }).once('close', (code) =>
      done(code ?? 1),
    );
  });
}

/** The final dump into the private uploads bucket, on the Owner key; undefined when the environment has no managed database. */
async function finalDump(context: InfraContext, owner: OwnerKey): Promise<string | undefined> {
  const { naming, region } = deriveInfra(context.appConfig);
  const state = stateKeyOf(owner, context.projectId);
  const bucket = appStorageNeeds(services).uploadBuckets ? naming.privateBucket : undefined;
  return writeFinalDump({
    rdb: createRdbClient({ secretKey: owner.secretKey, region }),
    instanceName: naming.resource('postgres'),
    databaseName: naming.dbName,
    environment: context.environment,
    bucket,
    s3: await makeS3Client(region, state.accessKey, state.secretKey, { streamed: true }),
    log: (message) => console.info(`  ${message}`),
  });
}

/** Destroy the stack's resources but the kept ones, remove the stack and the swept secrets; true when the destroy completed. */
async function destroyStack(context: InfraContext, owner: OwnerKey, kept: readonly KeptResource[]): Promise<boolean> {
  const { appConfig, projectId } = context;
  const stack = stackNameFor(context);
  const { naming, region, zones } = deriveInfra(appConfig);

  await exitWhenShutOut(context, owner);
  const passphrase = await ownerPassphrase(context, owner);
  const { accessKey, secretKey, organizationId } = owner;
  const env = buildProviderEnv(infraDir, { accessKey, secretKey, organizationId, projectId, passphrase });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);
  const lock = await acquireStackLockOrExit({ appConfig, ...stateKeyOf(owner, projectId), stack, operation: 'teardown' });

  let dump: string | undefined;
  let status: number;
  try {
    // A builder machine is no resource of the program, and its server holds one of the stack's security groups.
    for (const name of await removeBuilderMachines({ secretKey: owner.secretKey, projectId, zones, prefix: builderPrefix(naming.resource) })) {
      console.info(`  ${tildeMark} deleted builder ${name}`);
    }
    try {
      dump = await finalDump(context, owner);
      const forgotten = prepareState(stack, env, kept);
      if (forgotten.length > 0) console.info(pc.dim(`  kept out of the destroy: ${forgotten.join(', ')}`));
    } catch (error) {
      console.error(`${crossMark} ${errorMessage(error)}. Nothing was deleted; run the teardown again.`);
      return endAction(1);
    }
    console.info(pc.dim('\n→ pulumi destroy --refresh (this may take several minutes)...'));
    status = await pulumiDestroy(stack, env);
  } finally {
    await lock.release();
  }
  if (status !== 0) {
    console.error(`\n${warningMark} pulumi destroy exited ${status}. Running the teardown again is safe: it writes a dump while the database lives.`);
    return false;
  }
  console.info(`${checkMark} Stack resources destroyed.`);

  // State history remains in the versioned state bucket; removing the stack deletes its file, so the project id goes to the env file.
  const removed = spawnSync('pulumi', ['stack', 'rm', '--yes', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' });
  if (removed.status === 0) console.info(`${checkMark} Pulumi stack '${stack}' removed from the backend.`);
  writeEnvValues(resolve(infraDir, `.env.${context.environment}`), { SCW_PROJECT_ID: projectId });

  try {
    const secrets = createSecretManagerClient({ secretKey: owner.secretKey, region, projectId });
    const swept = sweptSecrets(await secrets.listSecrets(), kept);
    for (const secret of swept) await secrets.deleteSecret(secret.id);
    console.info(`${checkMark} Deleted ${swept.length} secret container(s).`);
  } catch (error) {
    console.warn(`${warningMark} Secrets not all deleted (${errorMessage(error)}): delete the rest in the console, but the kept ones.`);
  }

  console.info(`\n${pc.bold('Kept, with their contents:')} ${keptNames(context, kept)}.`);
  if (dump) console.info(`${pc.bold('Final dump:')} ${naming.privateBucket}/${dump} ${pc.dim('(RUNBOOKS.md, "Restore the final dump")')}`);
  console.info(pc.dim(`A setup again (\`pnpm infra --mode ${context.environment}\`) adopts them, in project ${projectId}.`));
  if (runnerServes({ projectId, definition: naming.resource('main') })) {
    console.info(
      pc.dim(`The runner still lists ${context.environment}: drop it from infra/runner.json, then \`${actionCommand('runner-replace')}\`.`),
    );
  }
  return true;
}

/** Delete the stack's identities: the per-mode group's applications with their keys and policies, then the group. The app's operator is not in it. */
async function deleteIdentities(context: InfraContext, ownerKey: OwnerKey): Promise<void> {
  const { appConfig } = context;
  const mode = context.environment;
  const group = `${appConfig.slug}-${mode}`;
  const { accessKey, secretKey, organizationId } = ownerKey;
  try {
    const { applications } = await listManagedPrincipals({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug, mode });
    if (applications.length === 0) console.info(`${tildeMark} No engine-managed IAM applications found.`);
    // A key that belongs to one of them must not delete its own application: the key dies with it, and every call after that fails.
    const self = await describeKey({ accessKey, secretKey }).catch(() => undefined);
    const { own, others } = splitOwnApplication(applications, self?.bearer === 'application' ? self.bearerId : undefined);
    for (const app of others) {
      await deleteApplicationCascade({ callerSecretKey: secretKey, organizationId, applicationId: app.id });
      console.info(`  ${tildeMark} Deleted ${app.name}`);
    }
    if (own) {
      console.warn(`${warningMark} Kept '${own.name}' and group ${group}: this run authenticates as that application. Delete both in the console.`);
      return;
    }
    await deleteGroup({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug, mode });
    await removeBootstrapDnsGrant({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug }).catch(() => false);
    console.info(`${checkMark} Identities deleted.`);
  } catch (error) {
    console.warn(`${warningMark} Identities not all deleted: ${errorMessage(error)}. Delete the rest in the console (group ${group}).`);
  }
}
