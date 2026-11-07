import { getTokenData } from 'sdk';
import { afterEach, describe, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createTestOrganization, createTestUser, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';
import { createInvitation } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'], selfRegistration: true });

afterEach(async () => await clearDatabase());

describe('Invitation token data', async () => {
  const call = await createAppClient();

  it("must not read another invitation's data via a browser that holds a different one", async () => {
    const organization = await createTestOrganization();
    const inviter = await createTestUser('inviter@example.com');
    const held = await createInvitation({ token: 'invoked', email: 'held@example.com', organization, createdBy: inviter.id });
    const other = await createInvitation({ email: 'other@example.com', organization, createdBy: inviter.id });

    const { response, error } = await call(getTokenData, {
      path: { kind: 'invitation', id: other.token.id },
      headers: { ...defaultHeaders, Cookie: held.invitationCookie },
    });

    // The same answer as without a cookie: the browser holds no token by that id.
    await expectRefusal({ response, error }, 401, 'invitation_not_found');
  });
});
