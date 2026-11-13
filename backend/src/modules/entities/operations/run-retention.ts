import { sql } from 'drizzle-orm';
import { getAdminDb } from '#/db/db';
import { env } from '#/env';

/**
 * Runs `apply_retention()`: partitions created ahead and dropped past their period, then the tombstone, owned-row and
 * row sweeps. The procedure creates and drops partitions, which only the table owner may, so it runs over the admin
 * connection.
 * @throws When `DATABASE_ADMIN_URL` is not set, so the jobs health shows a failed run.
 */
export async function runRetention(): Promise<void> {
  if (!env.DATABASE_ADMIN_URL) throw new Error('retention: DATABASE_ADMIN_URL is not set, apply_retention() did not run');
  await getAdminDb('retention').execute(sql`CALL public.apply_retention()`);
}
