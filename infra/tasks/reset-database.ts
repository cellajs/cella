import type { RdbBackup, RdbDatabase, RdbInstance, RdbPermission } from '../lib/scaleway/scaleway-rdb'
import { pc, checkMark, crossMark, warningMark } from '../lib/utils/cli-output'

/** The live API target shown to the operator for confirmation. */
export interface ResetTarget {
  instanceName: string
  instanceId: string
  databaseName: string
  /** Every database on the instance, so a wrong instance is visible before anything is destroyed. */
  databases: RdbDatabase[]
  /** `<database>@<instance>`, the exact string the operator must type. */
  token: string
}

export interface ResetDatabasePlan {
  instanceName: string
  databaseName: string
  /** Roles re-granted after the recreate. Both must succeed or the app stays down. */
  roles: readonly string[]
  permission: RdbPermission
  backupName: string
  backupExpiresAt?: string

  // Injected effects
  findInstance: (name: string) => Promise<RdbInstance | undefined>
  listDatabases: (instanceId: string) => Promise<RdbDatabase[]>
  createBackup: (input: { instanceId: string; databaseName: string; name: string; expiresAt?: string }) => Promise<RdbBackup>
  waitForBackup: (backupId: string) => Promise<RdbBackup>
  deleteDatabase: (instanceId: string, name: string) => Promise<void>
  createDatabase: (instanceId: string, name: string) => Promise<RdbDatabase>
  setPrivilege: (instanceId: string, databaseName: string, userName: string, permission: RdbPermission) => Promise<void>
  /** Typed confirmation. Returning false aborts before anything is touched. */
  confirm: (target: ResetTarget) => Promise<boolean>
  log: (message: string) => void
}

export interface ResetDatabaseResult {
  instanceId: string
  backupId: string
  granted: string[]
  aborted?: 'declined'
}

/** Thrown once the database is gone, carrying the backup needed to put it back. */
export class ResetIrrecoverableError extends Error {
  constructor(
    message: string,
    readonly backupId: string,
    readonly instanceId: string,
    readonly databaseName: string,
  ) {
    super(message)
    this.name = 'ResetIrrecoverableError'
  }
}

/**
 * Order the reset over injected effects.
 *
 * Everything before the delete is a guard; everything after is recovery-critical. Nothing mutates
 * before `confirm` returns true, and the delete never runs until its only undo, a backup, reports
 * `ready`. Staging has `disableBackup: true`, so no automatic backup exists to fall back
 * on. Failures after the delete rethrow as {@link ResetIrrecoverableError} carrying the backup id.
 */
export async function sequenceDatabaseReset(plan: ResetDatabasePlan): Promise<ResetDatabaseResult> {
  const instance = await plan.findInstance(plan.instanceName)
  if (!instance) throw new Error(`No managed database instance named '${plan.instanceName}' in this region/project.`)
  if (instance.status !== 'ready') {
    throw new Error(`Instance '${plan.instanceName}' is '${instance.status}', not 'ready' — refusing to reset.`)
  }

  const databases = await plan.listDatabases(instance.id)
  if (!databases.some((database) => database.name === plan.databaseName)) {
    throw new Error(
      `Instance '${plan.instanceName}' has no database '${plan.databaseName}' (found: ${databases.map((d) => d.name).join(', ') || 'none'}).`,
    )
  }

  const target: ResetTarget = {
    instanceName: plan.instanceName,
    instanceId: instance.id,
    databaseName: plan.databaseName,
    databases,
    token: `${plan.databaseName}@${plan.instanceName}`,
  }

  if (!(await plan.confirm(target))) {
    plan.log('Aborted; nothing was touched.')
    return { instanceId: instance.id, backupId: '', granted: [], aborted: 'declined' }
  }

  plan.log(`Backing up ${plan.databaseName}...`)
  const created = await plan.createBackup({
    instanceId: instance.id,
    databaseName: plan.databaseName,
    name: plan.backupName,
    expiresAt: plan.backupExpiresAt,
  })
  const backup = await plan.waitForBackup(created.id)
  plan.log(`${checkMark} Backup ready: ${backup.name} (${backup.id})`)

  // --- past here the database is being destroyed; failures are recoverable only from `backup` ---

  try {
    await plan.deleteDatabase(instance.id, plan.databaseName)
    plan.log(`${checkMark} Deleted database ${plan.databaseName}`)
  } catch (error) {
    // Nothing was destroyed if the delete itself failed, so this stays a normal error.
    throw new Error(`Failed to delete '${plan.databaseName}': ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    await plan.createDatabase(instance.id, plan.databaseName)
    plan.log(`${checkMark} Created empty database ${plan.databaseName}`)

    // Deletion drops database privileges. The recreated app stays unreachable
    // until both roles regain them.
    const granted: string[] = []
    for (const role of plan.roles) {
      await plan.setPrivilege(instance.id, plan.databaseName, role, plan.permission)
      granted.push(role)
      plan.log(`${checkMark} Granted ${plan.permission} on ${plan.databaseName} to ${role}`)
    }

    return { instanceId: instance.id, backupId: backup.id, granted }
  } catch (error) {
    throw new ResetIrrecoverableError(
      `${plan.databaseName} was deleted but could not be rebuilt: ${error instanceof Error ? error.message : String(error)}`,
      backup.id,
      instance.id,
      plan.databaseName,
    )
  }
}

/** For example, `pre-reset-cella-20260717-1345`; sorts chronologically. */
export function backupName(databaseName: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13)
  return `pre-reset-${databaseName}-${stamp}`
}

/** The two steps the CLI cannot run: they need the image on the VM, over the serial console. */
export function serialConsoleSteps(databaseName: string): string {
  return [
    `${warningMark} ${pc.bold('Two steps remain, on the Scaleway serial console')} ${pc.dim(`(${databaseName} is empty until they run)`)}:`,
    '',
    `  ${pc.dim('# 1. schema — self-verifying since the 99-verify block; a bad migrate aborts loudly')}`,
    `  cd /opt/app && docker compose --profile backend run --rm migrate`,
    '',
    `  ${pc.dim('# 2. first admin — signs in by magic link')}`,
    `  cd /opt/app && docker compose --profile backend run --rm \\`,
    `    -e ADMIN_EMAIL=you@example.com migrate node dist/seeds-bundle.js init`,
    '',
    `  ${pc.dim('The CDC worker needs no restart: it re-ensures its replication slot on every retry.')}`,
  ].join('\n')
}

/** Recovery instructions, printed when the database is gone and could not be rebuilt. */
export function restoreHint(error: ResetIrrecoverableError, region: string): string {
  return [
    `${crossMark} ${pc.red(pc.bold('The database was deleted and NOT rebuilt.'))}`,
    `  ${error.message}`,
    '',
    `  ${pc.bold('Restore it from the backup taken moments ago:')}`,
    `  scw rdb backup restore ${error.backupId} instance-id=${error.instanceId} \\`,
    `    database-name=${error.databaseName} region=${region}`,
    '',
    `  ${pc.dim('Then re-grant both roles — a restore does not bring privileges back:')}`,
    `  scw rdb privilege set instance-id=${error.instanceId} region=${region} \\`,
    `    database-name=${error.databaseName} user-name=admin_role permission=all`,
    `  scw rdb privilege set instance-id=${error.instanceId} region=${region} \\`,
    `    database-name=${error.databaseName} user-name=runtime_role permission=all`,
  ].join('\n')
}
