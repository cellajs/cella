import { eq } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { actorsTable } from '#/modules/actors/actors-db';
import { createAccount } from '#/modules/user/operations/create-account';
import { clearDatabase } from '../test-utils';

afterEach(async () => await clearDatabase());

describe('createAccount', () => {
  it('takes the id another party named the person by, and the actor row carries the same id', async () => {
    const id = generateId();
    const user = await createAccount({ var: { db } }, { newUser: { email: 'named@example.com', slug: 'named', name: 'Named' }, via: 'magic', id });

    expect(user.id).toBe(id);
    const [actor] = await db.select().from(actorsTable).where(eq(actorsTable.id, id));
    expect(actor?.kind).toBe('user');
  });

  it('mints an id when none is given', async () => {
    const user = await createAccount({ var: { db } }, { newUser: { email: 'minted@example.com', slug: 'minted', name: 'Minted' }, via: 'magic' });

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
