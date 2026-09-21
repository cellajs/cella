import { eq } from 'drizzle-orm';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { createSession } from '#/modules/auth/general/helpers/session';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { signUpUser } from '../fixtures';
import { createTestUser } from '../helpers';
import { clearDatabase } from '../test-utils';

vi.mock('#/modules/auth/general/helpers/enroll-device', () => ({
  enrollDevice: vi.fn().mockRejectedValue(new Error('devices table unavailable')),
}));

afterEach(async () => await clearDatabase());

describe('sign-in when device enrollment fails', () => {
  it('still creates the session and reports no new device', async () => {
    const user = await createTestUser(signUpUser.email);
    const context = {
      rawIp: null,
      country: null,
      asn: null,
      device: { name: null, type: 'desktop' as const, os: null, browser: null },
      deviceId: nanoid(24),
    };

    const { newDevice } = await createSession(user, context, 'passkey');

    expect(newDevice).toBeNull();
    expect(await db.select().from(sessionsTable).where(eq(sessionsTable.userId, user.id))).toHaveLength(1);
  });
});
