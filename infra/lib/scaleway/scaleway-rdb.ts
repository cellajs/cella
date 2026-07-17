import type { FetchLike } from '../utils/fetch-like'
import { type ScwAuth, scwFetch, scwSend } from './scw-fetch'

const RDB_BASE = 'https://api.scaleway.com/rdb/v1'

export interface RdbInstance {
  id: string
  name: string
  status: string
  engine?: string
  node_type?: string
}

export interface RdbDatabase {
  name: string
  owner?: string
  managed?: boolean
  size?: string
}

export interface RdbUser {
  name: string
  is_admin?: boolean
}

export interface RdbPrivilege {
  database_name: string
  user_name: string
  permission: string
}

export interface RdbBackup {
  id: string
  name: string
  status: string
  database_name: string
  instance_id?: string
  size?: string
  expires_at?: string | null
}

/** Scaleway's coarse per-database permission. `all` is what `database.ts` declares for both roles. */
export type RdbPermission = 'readonly' | 'readwrite' | 'all' | 'custom' | 'none'

interface InstanceListResponse {
  instances: RdbInstance[]
  total_count: number
}
interface DatabaseListResponse {
  databases: RdbDatabase[]
  total_count: number
}
interface UserListResponse {
  users: RdbUser[]
  total_count: number
}
interface PrivilegeListResponse {
  privileges: RdbPrivilege[]
  total_count: number
}

export interface RdbClientOptions {
  secretKey: string
  region: string
  fetchImpl?: FetchLike
}

/**
 * Minimal RDB client with destructive endpoints pinned to live API observations.
 * `deleteDatabase` has no active-use interlock; its caller must confirm the target.
 */
export function createRdbClient(opts: RdbClientOptions) {
  const auth: ScwAuth = { secretKey: opts.secretKey, fetchImpl: opts.fetchImpl }
  const region = encodeURIComponent(opts.region)
  const base = `${RDB_BASE}/regions/${region}`
  const instanceBase = (instanceId: string) => `${base}/instances/${encodeURIComponent(instanceId)}`

  return {
    /** Exact-name lookup. Returns undefined when no instance matches. */
    async findInstance(name: string): Promise<RdbInstance | undefined> {
      const res = await scwFetch<InstanceListResponse>(auth, 'GET', `${base}/instances?name=${encodeURIComponent(name)}`)
      return res.instances.find((instance) => instance.name === name)
    },

    async listDatabases(instanceId: string): Promise<RdbDatabase[]> {
      const res = await scwFetch<DatabaseListResponse>(auth, 'GET', `${instanceBase(instanceId)}/databases`)
      return res.databases
    },

    async listUsers(instanceId: string): Promise<RdbUser[]> {
      const res = await scwFetch<UserListResponse>(auth, 'GET', `${instanceBase(instanceId)}/users`)
      return res.users
    },

    async listPrivileges(instanceId: string, databaseName: string): Promise<RdbPrivilege[]> {
      const url = `${instanceBase(instanceId)}/privileges?database_name=${encodeURIComponent(databaseName)}`
      const res = await scwFetch<PrivilegeListResponse>(auth, 'GET', url)
      return res.privileges
    },

    async createDatabase(instanceId: string, name: string): Promise<RdbDatabase> {
      return scwFetch<RdbDatabase>(auth, 'POST', `${instanceBase(instanceId)}/databases`, { name })
    },

    /** Destructive and not protected by an active-use interlock. */
    async deleteDatabase(instanceId: string, name: string): Promise<void> {
      await scwSend(auth, 'DELETE', `${instanceBase(instanceId)}/databases/${encodeURIComponent(name)}`)
    },

    /** Restore database-level privileges that deletion removes and recreation does not recover. */
    async setPrivilege(instanceId: string, databaseName: string, userName: string, permission: RdbPermission): Promise<void> {
      await scwFetch<RdbPrivilege>(auth, 'PUT', `${instanceBase(instanceId)}/privileges`, {
        database_name: databaseName,
        user_name: userName,
        permission,
      })
    },

    async createBackup(input: { instanceId: string; databaseName: string; name: string; expiresAt?: string }): Promise<RdbBackup> {
      return scwFetch<RdbBackup>(auth, 'POST', `${base}/backups`, {
        instance_id: input.instanceId,
        database_name: input.databaseName,
        name: input.name,
        ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
      })
    },

    async getBackup(backupId: string): Promise<RdbBackup> {
      return scwFetch<RdbBackup>(auth, 'GET', `${base}/backups/${encodeURIComponent(backupId)}`)
    },
  }
}

export type RdbClient = ReturnType<typeof createRdbClient>

/**
 * Poll a backup until it reports `ready`. The reset must not proceed if the backup never
 * becomes ready. It is the only undo, and staging has `disableBackup: true` so no automatic
 * backup exists to fall back on.
 */
export async function waitForBackupReady(
  client: RdbClient,
  backupId: string,
  opts: { timeoutMs?: number; intervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RdbBackup> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000
  const intervalMs = opts.intervalMs ?? 3_000
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))

  const deadline = now() + timeoutMs
  let last: RdbBackup = await client.getBackup(backupId)
  while (last.status !== 'ready') {
    if (last.status === 'error') throw new Error(`Backup ${backupId} failed (status: error)`)
    if (now() >= deadline) throw new Error(`Backup ${backupId} not ready after ${Math.round(timeoutMs / 1000)}s (status: ${last.status})`)
    await sleep(intervalMs)
    last = await client.getBackup(backupId)
  }
  return last
}
