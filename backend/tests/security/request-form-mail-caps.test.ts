import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { requestsTable } from '#/modules/requests/requests-db';
import { defaultHeaders } from '../fixtures';
import { createUser, mailsTo } from '../helpers';
import { clearDatabase } from '../test-utils';

afterEach(async () => await clearDatabase());

/** Anyone may type anyone's address into the public request form, so each send is a mail the attacker aims. */
describe('Request form mail caps', async () => {
  const { baseApp: app } = await import('#/routes');

  const submit = async (email: string, type: 'contact' | 'waitlist', message: string | null) =>
    (await app.request('/requests', { method: 'POST', headers: defaultHeaders, body: JSON.stringify({ email, type, message }) })).status;

  it('must not mail one address more than once a day through the request form', async () => {
    const victim = `request-victim-${nanoid(8)}@security-test.com`.toLowerCase();
    const account = await createUser(`request-holder-${nanoid(8)}@security-test.com`.toLowerCase());

    // Two contact messages and a waitlist entry: all stored for the team, one confirmation to the address.
    expect([await submit(victim, 'contact', 'Hi'), await submit(victim, 'contact', 'Hi'), await submit(victim, 'waitlist', null)]).toEqual([
      204, 204, 204,
    ]);
    // A waitlist request is answered before it is stored.
    await vi.waitFor(async () =>
      expect(await db.select({ type: requestsTable.type }).from(requestsTable).where(eq(requestsTable.email, victim))).toHaveLength(3),
    );
    expect(mailsTo(victim)).toHaveLength(1);

    // The waitlist naming an account's address tells it of its account once.
    expect([await submit(account.email, 'waitlist', null), await submit(account.email, 'waitlist', null)]).toEqual([204, 204]);
    await vi.waitFor(() => expect(mailsTo(account.email)).toHaveLength(1));
  });
});
