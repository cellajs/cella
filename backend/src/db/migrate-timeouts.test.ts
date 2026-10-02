import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import pg, { type Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createPgConnection } from '#/db/create-connection';
import { describeMigrateTimeout, describeOpenTransactions } from '#/db/migrate-timeouts';

describe('describeMigrateTimeout', () => {
  it('names a lock wait and a statement timeout through the drizzle cause chain', () => {
    const wrapped = (code: string) => new Error('Failed query', { cause: Object.assign(new Error('canceling statement'), { code }) });
    expect(describeMigrateTimeout(wrapped('55P03'))).toMatch(/waited over 30s \(lock_timeout\)/);
    expect(describeMigrateTimeout(wrapped('57014'))).toMatch(/over 120s \(statement_timeout\)/);
  });

  it('stays silent on any other failure', () => {
    expect(describeMigrateTimeout(new Error('Failed query', { cause: Object.assign(new Error('dup'), { code: '23505' }) }))).toBeUndefined();
    expect(describeMigrateTimeout('boom')).toBeUndefined();
  });
});

describe('migrate session timeouts', () => {
  it('fails a DDL statement blocked by an open transaction once lock_timeout runs out, and lists that transaction', async () => {
    const url = process.env.DATABASE_ADMIN_URL;
    if (!url) throw new Error('DATABASE_ADMIN_URL is not set for the test run');
    const table = `lock_probe_${randomUUID().replaceAll('-', '')}`;
    const timeouts = { lockMs: 300, statementMs: 5_000 };
    const holder = new pg.Client({ connectionString: url, application_name: 'lock-holder' });
    const migrator = createPgConnection(url, { max: 1, sessionTimeouts: timeouts });
    await holder.connect();
    try {
      await holder.query(`CREATE TABLE ${table} (id int)`);
      // An open transaction holding a lock, as a session of a destroyed VM leaves one behind.
      await holder.query('BEGIN');
      await holder.query(`SELECT * FROM ${table}`);

      const startedAt = Date.now();
      const error = await migrator.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN extra int`)).catch((err: unknown) => err);
      expect(Date.now() - startedAt).toBeLessThan(4_000);
      expect(describeMigrateTimeout(error, timeouts)).toMatch(/lock_timeout/);

      const sessions = await describeOpenTransactions(migrator);
      expect(sessions.some((line) => line.includes('app=lock-holder') && line.includes('state=idle in transaction'))).toBe(true);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.query(`DROP TABLE IF EXISTS ${table}`);
      await holder.end();
      await (migrator.$client as Pool).end();
    }
  });
});
