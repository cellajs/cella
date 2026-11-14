import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { input } from '@inquirer/prompts';
import { deleteAppliedEngine } from '../../lib/deploy/applied-engine';
import { deleteLiveRecord } from '../../lib/deploy/live-record';
import { machineRoles } from '../../lib/machine-roles';
import { deriveInfra } from '../../lib/naming';
import { actionCommand, actionLabel } from '../../lib/operator-actions';
import { shutOutOfBuckets } from '../../lib/scaleway/bucket-admission';
import { removeMachines } from '../../lib/scaleway/machines';
import { appPrincipalNames } from '../../lib/scaleway/principals';
import { buildProviderEnv } from '../../lib/scaleway/provider-env';
import { makeS3Client, stateKeyOf } from '../../lib/scaleway/s3-client';
import { deleteApplicationCascade, deleteGroup, listManagedPrincipals, removeBootstrapDnsGrant } from '../../lib/scaleway/scaleway-iam';
import { createRdbClient } from '../../lib/scaleway/scaleway-rdb';
import { createSecretManagerClient } from '../../lib/scaleway/scaleway-secret-manager';
import { ENGINE_FOLDER, RUNTIME_FOLDER } from '../../lib/scaleway/secret-paths';
import { makeControlClient, stateBucket } from '../../lib/stack/control-store';
import { destroyableState, engineFolders, type KeptResource, keptResources, sweptSecrets } from '../../lib/stack/kept-resources';
import { verifyStackPassphrase } from '../../lib/stack/pulumi-passphrase';
import { exitCodeOf } from '../../lib/utils/child-exit';
import { checkMark, crossMark, pc, tildeMark, warningMark } from '../../lib/utils/cli-output';
import { writeEnvValues } from '../../lib/utils/env-files';
import { errorMessage } from '../../lib/utils/errors';
import { infraDir } from '../../lib/utils/paths';
import { builderPrefix, removeBuilderMachines } from '../../tasks/build-release';
import { writeFinalDump } from '../../tasks/final-dump';
import { readCustodiedPassphrase } from '../../tasks/passphrase-custody';
import { acquireStackLockOrExit, endAction, type InfraContext, pulumiLoginAndSelect, pulumiLoginUrl, stackNameFor } from '../shared';
import { acquireIdentityKey } from './operator-unlock';
import { type OwnerKey, printRevokeReminder } from './owner-key';

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
  const live = kept.flatMap(({ adopt }) => (!adopt ? [] : 'bucket' in adopt ? [adopt.bucket] : [`${RUNTIME_FOLDER}${adopt.secret}`]));
  return [...live, stateBucket(context.appConfig.slug)].join(', ');
}

/**
 * Tear an environment down in one act: the typed `<slug>-<mode>` and an Owner API key that ends within a day, and nothing else, as the Owner
 * key holds every right. Under the lease it deletes the builder machines and every role's machine with the live record that named them,
 * writes the final dump of the database into the boot-diag bucket, takes the kept resources out of the state (lib/stack/kept-resources.ts)
 * and destroys the rest. Then it removes the stack, deletes
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

/**
 * The passphrase from Secret Manager, read with the Owner key, which holds every right: a teardown asks for nothing but the typed name and
 * that key. Checked against the stack file's salt when this checkout has one; ends the action when Secret Manager holds none, or one that
 * does not open the stack.
 */
async function ownerPassphrase(context: InfraContext, owner: OwnerKey): Promise<string> {
  const custody = { secretKey: owner.secretKey, region: context.appConfig.s3.region, projectId: context.projectId };
  const stored = await readCustodiedPassphrase(custody).catch((error) => {
    console.error(`${crossMark} Could not read the passphrase from Secret Manager: ${errorMessage(error)}. Nothing was touched.`);
    return endAction(1);
  });
  const yaml = context.stackYaml;
  if (stored && (!yaml || !/^encryptionsalt:/m.test(yaml) || verifyStackPassphrase(yaml, stored))) return stored;
  console.error(
    `${crossMark} Secret Manager holds ${stored ? 'a passphrase that does not open this stack' : 'no passphrase'} under ${ENGINE_FOLDER}: \`${actionCommand('preview')}\` on the operator key stores the one you type there, then tear down again. Nothing was touched.`,
  );
  return endAction(1);
}

/** End the action when the bucket policies do not name the Owner key's bearer: the key would then read no state and write no dump. */
async function exitWhenShutOut(context: InfraContext, owner: OwnerKey): Promise<void> {
  const { bearer, bearerId, name } = owner.bearer;
  const principal = `${bearer === 'application' ? 'application_id' : 'user_id'}:${bearerId}`;
  if (!(await shutOutOfBuckets({ appConfig: context.appConfig, projectId: context.projectId, key: owner, principal }))) return;
  const names = appPrincipalNames(context.appConfig.appSlug);
  console.error(
    `${crossMark} The bucket policies of ${context.environment} do not name ${name}, so this key reads no state and writes no dump. Join '${names.operators}' in the console (IAM → Groups), run "${actionLabel('apply')}" so the policies name you, then tear down again. Nothing was touched.`,
  );
  endAction(1);
}

/**
 * Ready the state for the destroy, whatever an older program recorded in it (lib/stack/kept-resources.ts): the kept resources leave it,
 * every other bucket is emptied on delete, and every protection is lifted. `done` gets each step that held.
 */
function prepareState(stack: string, env: NodeJS.ProcessEnv, kept: readonly KeptResource[], done: string[]): void {
  const run = (args: string[]) =>
    spawnSync('pulumi', [...args, '--stack', stack], { cwd: infraDir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const exported = run(['stack', 'export']);
  if (exported.status !== 0) throw new Error(`pulumi stack export failed: ${exported.stderr.trim()}`);
  const ready = destroyableState(JSON.parse(exported.stdout), kept);
  if (ready.kept.length > 0 || ready.emptied.length > 0) {
    const folder = mkdtempSync(join(tmpdir(), 'teardown-'));
    writeFileSync(join(folder, 'before.json'), exported.stdout);
    writeFileSync(join(folder, 'after.json'), JSON.stringify(ready.document));
    const imported = run(['stack', 'import', '--file', join(folder, 'after.json')]);
    if (imported.status !== 0) throw new Error(`pulumi stack import failed: ${imported.stderr.trim()} (the export before is ${folder}/before.json)`);
    if (ready.kept.length > 0) done.push(`took ${ready.kept.join(', ')} out of the state, where the next setup adopts them`);
  }
  const unprotected = run(['state', 'unprotect', '--all', '--yes']);
  if (unprotected.status !== 0) throw new Error(`pulumi state unprotect failed: ${unprotected.stderr.trim()}`);
}

/** The final dump into the boot-diag bucket, on the Owner key; undefined when the environment has no managed database. */
async function finalDump(context: InfraContext, owner: OwnerKey): Promise<string | undefined> {
  const { naming, region } = deriveInfra(context.appConfig);
  const state = stateKeyOf(owner, context.projectId);
  return writeFinalDump({
    rdb: createRdbClient({ secretKey: owner.secretKey, region }),
    instanceName: naming.resource('postgres'),
    databaseName: naming.dbName,
    environment: context.environment,
    bucket: naming.bootDiagBucket,
    s3: await makeS3Client(region, state.accessKey, state.secretKey, { streamed: true }),
    log: (message) => console.info(`  ${message}`),
  });
}

/** Destroy the stack's resources but the kept ones, remove the stack and the swept secrets; true when the destroy completed. */
async function destroyStack(context: InfraContext, owner: OwnerKey, kept: readonly KeptResource[]): Promise<boolean> {
  const { appConfig, projectId } = context;
  const stack = stackNameFor(context);
  const { naming, region, zone, zones } = deriveInfra(appConfig);

  await exitWhenShutOut(context, owner);
  const passphrase = await ownerPassphrase(context, owner);
  const { accessKey, secretKey, organizationId } = owner;
  const env = buildProviderEnv(infraDir, { accessKey, secretKey, organizationId, projectId, passphrase, stateBackendUrl: pulumiLoginUrl(appConfig) });
  pulumiLoginAndSelect(infraDir, env, appConfig, stack);
  const lock = await acquireStackLockOrExit({ appConfig, ...stateKeyOf(owner, projectId), stack, operation: 'teardown' });

  let dump: string | undefined;
  let status: number;
  const done: string[] = [];
  try {
    try {
      // No machine is a resource of the program: the deploys made each role's, on a reserved address the destroy releases only once its
      // machine is gone, and a builder's server holds one of the stack's security groups.
      const builders = await removeBuilderMachines({ secretKey: owner.secretKey, projectId, zones, prefix: builderPrefix(naming.resource) });
      if (builders.length > 0) done.push(`deleted the builder machine(s) ${builders.join(', ')}`);
      const machines: string[] = [];
      for (const { role } of machineRoles(appConfig)) {
        machines.push(...(await removeMachines({ secretKey: owner.secretKey, projectId, zone, prefix: naming.resource(`${role}-`) })));
      }
      if (machines.length > 0) done.push(`deleted the machine(s) ${machines.join(', ')}`);
      // The kept boot-diag bucket keeps the rotations; the live record names machines that are gone, so the next setup's first deploy
      // boots every role anew, and the applied engine an image the registry loses with its namespace.
      const state = stateKeyOf(owner, projectId);
      const control = await makeControlClient(region, state.accessKey, state.secretKey);
      await deleteLiveRecord(control, naming.bootDiagBucket, stack);
      await deleteAppliedEngine(control, naming.bootDiagBucket, stack);
      dump = await finalDump(context, owner);
      if (dump) done.push(`wrote the final dump ${naming.bootDiagBucket}/${dump}`);
      prepareState(stack, env, kept, done);
    } catch (error) {
      const before = done.length > 0 ? ` Before it, the teardown ${done.join('; ')}.` : '';
      console.error(`${crossMark} ${errorMessage(error)}.${before} Nothing of the stack was destroyed: run the teardown again.`);
      return endAction(1);
    }
    console.info(pc.dim('\n→ pulumi destroy --refresh (this may take several minutes)...'));
    status = await exitCodeOf(spawn('pulumi', ['destroy', '--refresh', '--yes', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' }));
  } finally {
    await lock.release();
  }
  if (status !== 0) {
    console.error(
      `\n${warningMark} pulumi destroy exited ${status}: what it reached is gone, the rest stays in the state. Running the teardown again finishes it, and writes a dump first while the database lives.`,
    );
    return false;
  }
  console.info(`${checkMark} Stack resources destroyed.`);

  // State history remains in the versioned state bucket; removing the stack deletes its file, so the project id goes to the env file.
  const removed = spawnSync('pulumi', ['stack', 'rm', '--yes', '--stack', stack], { cwd: infraDir, env, stdio: 'inherit' });
  if (removed.status === 0) console.info(`${checkMark} Pulumi stack '${stack}' removed from the backend.`);
  writeEnvValues(resolve(infraDir, `.env.${context.environment}`), { SCW_DEFAULT_PROJECT_ID: projectId });

  try {
    const secrets = createSecretManagerClient({ secretKey: owner.secretKey, region, projectId });
    const swept = sweptSecrets(await secrets.listSecrets(), kept, engineFolders);
    for (const secret of swept) await secrets.deleteSecret(secret.id);
    console.info(`${checkMark} Deleted ${swept.length} secret container(s).`);
  } catch (error) {
    console.warn(`${warningMark} Secrets not all deleted (${errorMessage(error)}): delete the rest in the console, but the kept ones.`);
  }

  console.info(`\n${pc.bold('Kept, with their contents:')} ${keptNames(context, kept)}.`);
  if (dump) console.info(`${pc.bold('Final dump:')} ${naming.bootDiagBucket}/${dump} ${pc.dim('(RUNBOOKS.md, "Restore the final dump")')}`);
  console.info(pc.dim(`A setup again (\`pnpm infra --mode ${context.environment}\`) adopts them, in project ${projectId}.`));
  return true;
}

/** Delete the stack's identities: the per-mode group's applications with their keys and policies, then the group. The app's operator is not in it. */
async function deleteIdentities(context: InfraContext, ownerKey: OwnerKey): Promise<void> {
  const { appConfig } = context;
  const mode = context.environment;
  const group = `${appConfig.slug}-${mode}`;
  const { secretKey, organizationId, bearer } = ownerKey;
  try {
    const { applications } = await listManagedPrincipals({ callerSecretKey: secretKey, organizationId, slug: appConfig.slug, mode });
    if (applications.length === 0) console.info(`${tildeMark} No engine-managed IAM applications found.`);
    // A key that belongs to one of them must not delete its own application: the key dies with it, and every call after that fails.
    const { own, others } = splitOwnApplication(applications, bearer.bearer === 'application' ? bearer.bearerId : undefined);
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
