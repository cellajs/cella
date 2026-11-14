import { sql } from 'drizzle-orm';
import { getAdminDb } from '#/db/db';
import { env } from '#/env';

/**
 * Runs `apply_retention()`: partitions created ahead and dropped past their period, then the tombstone, owned-row and
 * row sweeps. It runs over the admin connection: only the table owner may create and drop partitions.
 * @throws When `DATABASE_ADMIN_URL` is not set: the jobs health shows a failed run.
 */
export async function runRetention(): Promise<void> {
  if (!env.DATABASE_ADMIN_URL) throw new Error('retention: DATABASE_ADMIN_URL is not set, apply_retention() did not run');
  await getAdminDb('retention').execute(sql`CALL public.apply_retention()`);
}
