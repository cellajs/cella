import { eq } from 'drizzle-orm';
import { updateOrganization } from 'sdk';
import { appConfig, type Language } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { adminRole, defaultHeaders } from './fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, expectRefusal } from './helpers';
import { clearSecurityTestData } from './security/helpers';
import { createAppClient } from './test-client';

const [first, second] = appConfig.languageCodes;

describe.skipIf(!second)('Organization default language', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  /** An organization with the given languages and the headers of its admin. */
  const seed = async (languageCodes: Language[], defaultLanguageCode: Language) => {
    const organization = await createTestOrganization({ languageCodes, defaultLanguageCode });
    const admin = await createOrganizationAdminUser('default-language-admin@example.test', organization.id, adminRole, organization.tenantId);
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };
    return { path: { tenantId: organization.tenantId, organizationId: organization.id }, headers };
  };

  it('refuses languages that leave the default out, and keeps the row', async () => {
    const { path, headers } = await seed([first, second], first);

    await expectRefusal(await call(updateOrganization, { path, body: { languageCodes: [second] }, headers }), 400, 'default_language_not_offered');

    const [stored] = await db
      .select({ languageCodes: organizationsTable.languageCodes, defaultLanguageCode: organizationsTable.defaultLanguageCode })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, path.organizationId));
    expect(stored).toEqual({ languageCodes: [first, second], defaultLanguageCode: first });
  });

  it('saves a row whose default is already outside its languages while neither field is sent', async () => {
    const { path, headers } = await seed([first], second);

    const { response } = await call(updateOrganization, { path, body: { name: 'Renamed' }, headers });
    expect(response.status).toBe(200);
  });
});
