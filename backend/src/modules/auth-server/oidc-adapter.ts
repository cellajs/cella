import { type SQL, sql } from 'drizzle-orm';
import type { Adapter, AdapterPayload } from 'oidc-provider';
import { unsafeInternalAdminDb } from '#/db/db';
import { baseLog } from '#/lib/pino';

/**
 * Postgres storage adapter for `node-oidc-provider`, replacing the dev-only
 * in-memory adapter so Authorization Server state (sessions, grants,
 * authorization codes, refresh tokens, DCR clients, …) survives restarts and can
 * be shared across processes.
 *
 * All OIDC models share one generic table, keyed by (type, id). It is global
 * infrastructure — not tenant-scoped — so it uses the BYPASSRLS admin connection
 * and is bootstrapped with `CREATE TABLE IF NOT EXISTS` (flag-gated experiment;
 * promote to a real Drizzle migration when the auth server graduates).
 *
 * @see .todos/MCP_PLAN.md (Phase 1)
 */

function db() {
  if (!unsafeInternalAdminDb) throw new Error('OIDC adapter requires a database connection (NODB is set)');
  return unsafeInternalAdminDb;
}

let ensured: Promise<void> | undefined;

/** Idempotently create the OIDC payload store. Cached so it runs once per process. */
export function ensureOidcPayloadsTable(): Promise<void> {
  ensured ??= (async () => {
    await db().execute(sql`
      CREATE TABLE IF NOT EXISTS oidc_payloads (
        id varchar(255) NOT NULL,
        type varchar(64) NOT NULL,
        payload jsonb NOT NULL,
        grant_id varchar(255),
        user_code varchar(255),
        uid varchar(255),
        expires_at timestamptz,
        consumed_at timestamptz,
        PRIMARY KEY (type, id)
      )
    `);
    await db().execute(sql`CREATE INDEX IF NOT EXISTS oidc_payloads_grant_id_idx ON oidc_payloads (grant_id)`);
    await db().execute(sql`CREATE INDEX IF NOT EXISTS oidc_payloads_uid_idx ON oidc_payloads (uid)`);
    await db().execute(sql`CREATE INDEX IF NOT EXISTS oidc_payloads_user_code_idx ON oidc_payloads (user_code)`);
    await db().execute(sql`CREATE INDEX IF NOT EXISTS oidc_payloads_expires_at_idx ON oidc_payloads (expires_at)`);
    baseLog.info('oidc_payloads store ready');
  })();
  return ensured;
}

interface PayloadRow {
  payload: AdapterPayload;
  consumed_at: Date | null;
  expires_at: Date | null;
}

export class PostgresOidcAdapter implements Adapter {
  constructor(private readonly name: string) {}

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    await db().execute(sql`
      INSERT INTO oidc_payloads (id, type, payload, grant_id, user_code, uid, expires_at)
      VALUES (${id}, ${this.name}, ${JSON.stringify(payload)}::jsonb, ${payload.grantId ?? null}, ${payload.userCode ?? null}, ${payload.uid ?? null}, ${expiresAt})
      ON CONFLICT (type, id) DO UPDATE SET
        payload = EXCLUDED.payload,
        grant_id = EXCLUDED.grant_id,
        user_code = EXCLUDED.user_code,
        uid = EXCLUDED.uid,
        expires_at = EXCLUDED.expires_at
    `);
  }

  private async findWhere(where: SQL): Promise<AdapterPayload | undefined> {
    const result = await db().execute(
      sql`SELECT payload, consumed_at, expires_at FROM oidc_payloads WHERE type = ${this.name} AND ${where} LIMIT 1`,
    );
    const row = result.rows?.[0] as unknown as PayloadRow | undefined;
    if (!row) return undefined;
    // Expired rows are treated as absent (lazy expiry; a sweeper can prune later).
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return undefined;
    if (!row.consumed_at) return row.payload;
    return { ...row.payload, consumed: Math.floor(new Date(row.consumed_at).getTime() / 1000) };
  }

  find(id: string): Promise<AdapterPayload | undefined> {
    return this.findWhere(sql`id = ${id}`);
  }

  findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this.findWhere(sql`user_code = ${userCode}`);
  }

  findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.findWhere(sql`uid = ${uid}`);
  }

  async consume(id: string): Promise<void> {
    await db().execute(sql`UPDATE oidc_payloads SET consumed_at = now() WHERE type = ${this.name} AND id = ${id}`);
  }

  async destroy(id: string): Promise<void> {
    await db().execute(sql`DELETE FROM oidc_payloads WHERE type = ${this.name} AND id = ${id}`);
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await db().execute(sql`DELETE FROM oidc_payloads WHERE grant_id = ${grantId}`);
  }
}
