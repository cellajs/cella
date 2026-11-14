import { deriveInfra } from '../../lib/naming';
import { createRdbClient, waitForBackupReady } from '../../lib/scaleway/scaleway-rdb';
import { checkMark, crossMark, pc, warningMark } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { backupName, ResetIrrecoverableError, type ResetTarget, rebuildSteps, restoreHint, sequenceDatabaseReset } from '../../tasks/reset-database';
import { input } from '../prompts/back';
import { endAction, endsAction, type InfraContext } from '../shared';
import { environmentName, printLossWarning } from './loss-warning';
import { acquireOperatorKey } from './operator-unlock';

/** Roles the operator task ensure-database makes on the instance (`tasks/ensure-database.ts`). Both must be re-granted. */
const ROLES = ['admin_role', 'runtime_role'] as const;

/** Retention for the pre-reset backup. Long enough to notice a bad reset the next working week. */
const BACKUP_RETENTION_DAYS = 7;

/** Render live instance data so an incorrectly targeted RDB instance is visible before approval. */
function describeTarget(target: ResetTarget, region: string): string {
  const others = target.databases.filter((database) => database.name !== target.databaseName).map((database) => database.name);

  return [
    '',
    pc.bold('Reset target'),
    `  instance   ${pc.bold(target.instanceName)} ${pc.dim(`(${target.instanceId}, ${region})`)}`,
    `  database   ${pc.red(pc.bold(target.databaseName))} ${pc.dim('deleted and made again, empty')}`,
    `  survives   ${others.length ? others.join(', ') : pc.dim('(none)')}`,
    '',
  ].join('\n');
}

/**
 * "Reset database": delete + recreate this app's logical database over the Scaleway API with the
 * operator key, then re-grant both roles. The same-name recreate preserves Pulumi state without
 * exposing the database.
 */
export async function runResetDatabase(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Reset database" requires a fully bootstrapped stack (state=${context.state}).`);
    endAction(1);
  }

  const { appConfig, environment } = context;
  const { naming, region } = deriveInfra(appConfig);
  const instanceName = naming.resource('postgres');
  const databaseName = naming.dbName;

  printLossWarning('db-reset', environment, [
    `Everything in the ${environmentName(environment)} database is deleted, and the database is made again, empty.`,
    `A backup is taken first and kept for ${BACKUP_RETENTION_DAYS} days. If the backup does not finish, nothing is deleted.`,
    'Nothing else stops it: the database goes even while the app is using it.',
    'Then you reboot the backend machine, which rebuilds the tables and the admin account.',
  ]);

  // A privileged write, so the same key flow as Apply: a key minted from the operator key, asked once per session.
  const operator = await acquireOperatorKey(context);
  const client = createRdbClient({ secretKey: operator.secretKey, region });
  const expiresAt = new Date(Date.now() + BACKUP_RETENTION_DAYS * 86_400_000).toISOString();

  try {
    const result = await sequenceDatabaseReset({
      instanceName,
      databaseName,
      roles: ROLES,
      permission: 'all',
      backupName: backupName(databaseName, new Date()),
      backupExpiresAt: expiresAt,

      findInstance: (name) => client.findInstance(name),
      listDatabases: (instanceId) => client.listDatabases(instanceId),
      createBackup: (input) => client.createBackup(input),
      waitForBackup: (backupId) => waitForBackupReady(client, backupId),
      deleteDatabase: (instanceId, name) => client.deleteDatabase(instanceId, name),
      createDatabase: (instanceId, name) => client.createDatabase(instanceId, name),
      setPrivilege: (instanceId, database, user, permission) => client.setPrivilege(instanceId, database, user, permission),
      log: (message) => console.info(`  ${message}`),

      confirm: async (target) => {
        console.info(describeTarget(target, region));
        const typed = await input({ message: `Type ${pc.cyan(target.token)} to reset the database` });
        return typed.trim() === target.token;
      },
    });

    if (result.aborted) return;

    console.info(`\n${checkMark} ${pc.green(`${databaseName} recreated`)}: empty, with ${result.granted.join(' + ')} re-granted.`);
    console.info(`  ${pc.dim(`Backup retained ${BACKUP_RETENTION_DAYS} days: ${result.backupId}`)}\n`);
    console.info(rebuildSteps(databaseName));
    console.info(`\n  ${pc.dim(`Then confirm: curl ${appConfig.backendUrl}/health?depth=full`)}`);
  } catch (error) {
    if (endsAction(error)) throw error;
    if (error instanceof ResetIrrecoverableError) {
      console.error(`\n${restoreHint(error, region)}\n`);
      endAction(1);
    }
    console.error(`\n${crossMark} Reset aborted: ${errorMessage(error)}`);
    console.error(`  ${pc.dim('Nothing was destroyed: the guards run before the delete.')}\n`);
    endAction(1);
  }
}
