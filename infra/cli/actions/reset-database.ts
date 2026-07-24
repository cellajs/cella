import { input } from '@inquirer/prompts'
import { deriveInfra } from '../../lib/naming'
import { createRdbClient, waitForBackupReady } from '../../lib/scaleway/scaleway-rdb'
import { errorMessage } from '../../lib/utils/errors'
import {
  backupName,
  ResetIrrecoverableError,
  type ResetTarget,
  restoreHint,
  sequenceDatabaseReset,
  serialConsoleSteps,
} from '../../tasks/reset-database'
import { maskedSecret } from '../prompts/masked-secret'
import { envOr, type InfraContext } from '../shared'
import { pc, checkMark, crossMark, warningMark } from '../../lib/utils/cli-output'

/** Roles Pulumi provisions on the instance (`resources/database.ts`). Both must be re-granted. */
const ROLES = ['admin_role', 'runtime_role'] as const

/** Retention for the pre-reset backup. Long enough to notice a bad reset the next working week. */
const BACKUP_RETENTION_DAYS = 7

/** Render live instance data so an incorrectly targeted RDB instance is visible before approval. */
function describeTarget(target: ResetTarget, region: string): string {
  const others = target.databases
    .filter((database) => database.name !== target.databaseName)
    .map((database) => database.name)

  return [
    '',
    pc.bold('Reset target'),
    `  instance   ${pc.bold(target.instanceName)} ${pc.dim(`(${target.instanceId}, ${region})`)}`,
    `  database   ${pc.red(pc.bold(target.databaseName))} ${pc.dim('— will be DELETED and recreated empty')}`,
    `  survives   ${others.length ? others.join(', ') : pc.dim('(none)')}`,
    '',
    `${warningMark} ${pc.bold('Everything in')} ${pc.red(target.databaseName)} ${pc.bold('is destroyed.')} A backup is taken first, and the`,
    `  reset aborts unless it reports ready. Nothing else stops this: Scaleway deletes a live`,
    `  database with connected clients and an active replication slot without complaint.`,
    '',
  ].join('\n')
}

/**
 * "Reset database": delete + recreate this app's logical database over the Scaleway API with a
 * bootstrap key, then re-grant both roles. The same-name recreate preserves Pulumi state without
 * exposing the database.
 */
export async function runResetDatabase(context: InfraContext): Promise<void> {
  if (context.state !== 'bootstrapped') {
    console.error(`${warningMark} "Reset database" requires a fully bootstrapped stack (state=${context.state}).`)
    process.exit(1)
  }

  const { appConfig } = context
  const { naming, region } = deriveInfra(appConfig)
  const instanceName = naming.resource('postgres')
  const databaseName = naming.dbName

  console.info(pc.dim('\nReset database: delete + recreate the logical database, then re-grant roles.'))
  console.info(pc.dim('Pre-production use, or with services quiesced — this is a hard outage.\n'))

  // Only the secret key is needed: the Scaleway API authenticates with X-Auth-Token alone.
  const bootSecret = await envOr('SCW_BOOTSTRAP_SECRET_KEY', () => maskedSecret({ message: 'Scaleway bootstrap secret key' }))

  const client = createRdbClient({ secretKey: bootSecret, region })
  const expiresAt = new Date(Date.now() + BACKUP_RETENTION_DAYS * 86_400_000).toISOString()

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
        console.info(describeTarget(target, region))
        const typed = await input({
          message: `Type ${pc.bold(target.token)} to reset it, anything else to abort:`,
        })
        return typed.trim() === target.token
      },
    })

    if (result.aborted) return

    console.info(`\n${checkMark} ${pc.green(`${databaseName} recreated`)} — empty, with ${result.granted.join(' + ')} re-granted.`)
    console.info(`  ${pc.dim(`Backup retained ${BACKUP_RETENTION_DAYS} days: ${result.backupId}`)}\n`)
    console.info(serialConsoleSteps(databaseName))
    console.info(`\n  ${pc.dim(`Then confirm: curl ${appConfig.backendUrl}/health?depth=full`)}`)
  } catch (error) {
    if (error instanceof ResetIrrecoverableError) {
      console.error(`\n${restoreHint(error, region)}\n`)
      process.exit(1)
    }
    console.error(`\n${crossMark} Reset aborted: ${errorMessage(error)}`)
    console.error(`  ${pc.dim('Nothing was destroyed — the guards run before the delete.')}\n`)
    process.exit(1)
  }
}
