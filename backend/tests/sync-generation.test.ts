import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getSeedDb } from '#/db/db';
import { appCatchupOp } from '#/modules/entities/operations/app-catchup';

const seedDb = getSeedDb();

/** The generation of the sync books travels with every catchup answer: a client that holds another one refetches. */
describe('catchup: the generation of the sync books', () => {
  afterAll(async () => {
    await seedDb.execute(sql`DELETE FROM sync_state`);
  });

  it('answers 1 on a database whose books the worker never had to rebuild', async () => {
    await seedDb.execute(sql`DELETE FROM sync_state`);

    expect(await appCatchupOp([])).toMatchObject({ changes: {}, cursor: null, generation: 1 });
  });

  it('answers the generation the worker wrote, read with the API role', async () => {
    // The CDC worker owns the row; the API only reads it.
    await seedDb.execute(sql`INSERT INTO sync_state (id, generation) VALUES ('sync', 7) ON CONFLICT (id) DO UPDATE SET generation = 7`);

    expect((await appCatchupOp([])).generation).toBe(7);
  });
});
