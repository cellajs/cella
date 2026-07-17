import { describe, expect, it, vi } from 'vitest'
import type { RdbBackup, RdbDatabase, RdbInstance } from '../lib/scaleway/scaleway-rdb'
import { backupName, ResetIrrecoverableError, type ResetDatabasePlan, sequenceDatabaseReset, serialConsoleSteps } from './reset-database'

const INSTANCE: RdbInstance = { id: 'inst-1', name: 'cella-postgres', status: 'ready' }
const DATABASES: RdbDatabase[] = [{ name: 'cella' }, { name: 'rdb' }]
const BACKUP: RdbBackup = { id: 'bk-1', name: 'pre-reset-cella', status: 'ready', database_name: 'cella' }

/** A plan whose effects all succeed, recording call order into `calls`. */
function makePlan(overrides: Partial<ResetDatabasePlan> = {}) {
  const calls: string[] = []
  const plan: ResetDatabasePlan = {
    instanceName: 'cella-postgres',
    databaseName: 'cella',
    roles: ['admin_role', 'runtime_role'],
    permission: 'all',
    backupName: 'pre-reset-cella',

    findInstance: vi.fn(async () => {
      calls.push('findInstance')
      return INSTANCE
    }),
    listDatabases: vi.fn(async () => {
      calls.push('listDatabases')
      return DATABASES
    }),
    confirm: vi.fn(async () => {
      calls.push('confirm')
      return true
    }),
    createBackup: vi.fn(async () => {
      calls.push('createBackup')
      return { ...BACKUP, status: 'creating' }
    }),
    waitForBackup: vi.fn(async () => {
      calls.push('waitForBackup')
      return BACKUP
    }),
    deleteDatabase: vi.fn(async () => {
      calls.push('deleteDatabase')
    }),
    createDatabase: vi.fn(async () => {
      calls.push('createDatabase')
      return { name: 'cella' }
    }),
    setPrivilege: vi.fn(async (_i: string, _d: string, user: string) => {
      calls.push(`setPrivilege:${user}`)
    }),
    log: () => {},
    ...overrides,
  }
  return { plan, calls }
}

describe('sequenceDatabaseReset', () => {
  it('backs up before deleting, then recreates and re-grants every role', async () => {
    const { plan, calls } = makePlan()

    const result = await sequenceDatabaseReset(plan)

    // Order is the safety property: confirm and a ready backup both precede the delete.
    expect(calls).toEqual([
      'findInstance',
      'listDatabases',
      'confirm',
      'createBackup',
      'waitForBackup',
      'deleteDatabase',
      'createDatabase',
      'setPrivilege:admin_role',
      'setPrivilege:runtime_role',
    ])
    expect(result).toMatchObject({ instanceId: 'inst-1', backupId: 'bk-1', granted: ['admin_role', 'runtime_role'] })
  })

  it('destroys nothing when the operator declines', async () => {
    const { plan, calls } = makePlan({ confirm: vi.fn(async () => false) })

    const result = await sequenceDatabaseReset(plan)

    expect(result.aborted).toBe('declined')
    expect(calls).not.toContain('createBackup')
    expect(calls).not.toContain('deleteDatabase')
    expect(plan.deleteDatabase).not.toHaveBeenCalled()
  })

  it('never deletes when the backup fails to become ready', async () => {
    const { plan } = makePlan({
      waitForBackup: vi.fn(async () => {
        throw new Error('Backup bk-1 failed (status: error)')
      }),
    })

    await expect(sequenceDatabaseReset(plan)).rejects.toThrow(/Backup bk-1 failed/)
    expect(plan.deleteDatabase).not.toHaveBeenCalled()
  })

  it('refuses an unknown instance before touching anything', async () => {
    const { plan } = makePlan({ findInstance: vi.fn(async () => undefined) })

    await expect(sequenceDatabaseReset(plan)).rejects.toThrow(/No managed database instance named 'cella-postgres'/)
    expect(plan.confirm).not.toHaveBeenCalled()
    expect(plan.deleteDatabase).not.toHaveBeenCalled()
  })

  it('refuses an instance that is not ready', async () => {
    const { plan } = makePlan({ findInstance: vi.fn(async () => ({ ...INSTANCE, status: 'backuping' })) })

    await expect(sequenceDatabaseReset(plan)).rejects.toThrow(/is 'backuping', not 'ready'/)
    expect(plan.confirm).not.toHaveBeenCalled()
  })

  it('refuses when the target database is absent, naming what it did find', async () => {
    // Guards against a right-instance/wrong-name reset silently creating a new empty database.
    const { plan } = makePlan({ listDatabases: vi.fn(async () => [{ name: 'rdb' }]) })

    await expect(sequenceDatabaseReset(plan)).rejects.toThrow(/has no database 'cella' \(found: rdb\)/)
    expect(plan.confirm).not.toHaveBeenCalled()
  })

  it('shows the operator the exact token and every database on the instance', async () => {
    const confirm = vi.fn(async () => true)
    const { plan } = makePlan({ confirm })

    await sequenceDatabaseReset(plan)

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'cella@cella-postgres', instanceId: 'inst-1', databases: DATABASES }),
    )
  })

  it('surfaces the backup id when the database is gone and cannot be rebuilt', async () => {
    const { plan } = makePlan({
      createDatabase: vi.fn(async () => {
        throw new Error('quota exceeded')
      }),
    })

    // The one unrecoverable window: deleted, not recreated. The error must carry the way back.
    const error = await sequenceDatabaseReset(plan).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ResetIrrecoverableError)
    expect(error).toMatchObject({ backupId: 'bk-1', instanceId: 'inst-1', databaseName: 'cella' })
    expect((error as Error).message).toMatch(/quota exceeded/)
  })

  it('treats a failed re-grant as unrecoverable — an ungranted database is an outage', async () => {
    const { plan } = makePlan({
      setPrivilege: vi.fn(async (_i: string, _d: string, user: string) => {
        if (user === 'runtime_role') throw new Error('boom')
      }),
    })

    const error = await sequenceDatabaseReset(plan).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ResetIrrecoverableError)
    expect((error as ResetIrrecoverableError).backupId).toBe('bk-1')
  })

  it('keeps a failed delete a plain error — nothing was destroyed', async () => {
    const { plan } = makePlan({
      deleteDatabase: vi.fn(async () => {
        throw new Error('403 forbidden')
      }),
    })

    const error = await sequenceDatabaseReset(plan).catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(ResetIrrecoverableError)
    expect((error as Error).message).toMatch(/Failed to delete 'cella'.*403 forbidden/)
  })
})

describe('serialConsoleSteps', () => {
  it('prints the two steps the CLI cannot run, and no worker restart', () => {
    const steps = serialConsoleSteps('cella')

    expect(steps).toContain('docker compose --profile backend run --rm migrate')
    expect(steps).toContain('dist/seeds-bundle.js init')
    // The slot is re-ensured on every retry, so a restart would be cargo cult.
    expect(steps).toMatch(/no restart/i)
  })
})

describe('backupName', () => {
  it('stamps the backup so the list sorts chronologically', () => {
    expect(backupName('cella', new Date('2026-07-17T13:45:12.345Z'))).toBe('pre-reset-cella-20260717-1345')
  })

  it('names the database it belongs to, so a multi-database instance stays legible', () => {
    expect(backupName('cella_staging', new Date('2026-01-02T03:04:05.000Z'))).toBe('pre-reset-cella_staging-20260102-0304')
  })
})
