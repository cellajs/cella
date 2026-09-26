import { createAttachments, createServiceAccount } from 'sdk';
import { hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateServerHLC } from '#/core/stx';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { createTestOrganization } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const memberRole = hierarchy.getLeastPrivilegedRole('organization');
const [adminRole] = hierarchy.getRoles('organization');

/** Machine requests carry no Origin and no cookie: a server, not a browser page. */
const machineHeaders = (key: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${key}` });

/** The parts of an error answer that come from the refusal itself, without the per-request path, id and time. */
const refusalOf = ({ status, type, name, message, severity, entityType, meta }: ErrorResponse) => ({
  status,
  type,
  name,
  message,
  severity,
  entityType,
  meta,
});

/**
 * A product the caller may not read answers like one that does not exist: a 403 there would confirm the id. A 403 is
 * for an action denied on a row the caller can read.
 */
describe('Product existence (getValidProduct)', async () => {
  const call = await createAppClient();
  const { baseApp } = await import('#/routes');
  let organization: { id: string; tenantId: string };
  let admin: { id: string; sessionCookie: string };
  let member: { id: string; sessionCookie: string };
  /** An API key whose scopes leave attachments out, and one that may read them only. */
  let unscopedKey: string;
  let readOnlyKey: string;
  const attachmentId = generateId();

  const attachmentUrl = (id: string) => `/${organization.tenantId}/${organization.id}/attachments/${id}`;

  const read = async (id: string, headers: Record<string, string>) => {
    const response = await baseApp.request(attachmentUrl(id), { headers });
    return { status: response.status, body: (await response.json()) as ErrorResponse };
  };

  const rename = async (id: string, headers: Record<string, string>) => {
    const stx = { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { name: generateServerHLC('test-client') } };
    const response = await baseApp.request(attachmentUrl(id), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ops: { name: 'Renamed' }, stx }),
    });
    return { status: response.status, body: (await response.json()) as ErrorResponse };
  };

  const issueKey = async (name: string, scopes: ('organization:read' | 'attachment:read')[]) => {
    const { data, response } = await call(createServiceAccount, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: { name, role: adminRole, key: { name: 'key', scopes } },
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    expect(response.status).toBe(201);
    return (data as { apiKey: { secret: string } }).apiKey.secret;
  };

  beforeAll(async () => {
    mockFetchRequest();
    organization = await createTestOrganization();
    admin = await createOrgUser(call, organization.tenantId, organization.id, 'existence-admin', adminRole);
    member = await createOrgUser(call, organization.tenantId, organization.id, 'existence-member', memberRole);
    unscopedKey = await issueKey('Organization bot', ['organization:read']);
    readOnlyKey = await issueKey('Reader bot', ['attachment:read']);

    const { response } = await call(createAttachments, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: [
        {
          id: attachmentId,
          filename: 'existence.pdf',
          contentType: 'application/pdf',
          size: '1024',
          keys: { original: `${organization.id}/${admin.id}/existence.pdf` },
          stx: { mutationId: attachmentId, sourceId: 'product-existence', fieldTimestamps: {} },
        },
      ],
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    expect(response.status).toBe(201);
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not confirm a product id via getAttachment to a caller who may not read it', async () => {
    const existing = await read(attachmentId, machineHeaders(unscopedKey));
    const missing = await read(generateId(), machineHeaders(unscopedKey));
    expect(existing.status).toBe(404);
    expect(refusalOf(existing.body)).toEqual(refusalOf(missing.body));
  });

  it('must not confirm a product id via updateAttachment to a caller who may not read it', async () => {
    const existing = await rename(attachmentId, machineHeaders(unscopedKey));
    const missing = await rename(generateId(), machineHeaders(unscopedKey));
    expect(existing.status).toBe(404);
    expect(refusalOf(existing.body)).toEqual(refusalOf(missing.body));
  });

  it('answers 403 for an action denied on a readable product (positive control)', async () => {
    // A member reads every attachment of the organization but updates only their own.
    expect((await read(attachmentId, { ...defaultHeaders, Cookie: member.sessionCookie })).status).toBe(200);
    const byMember = await rename(attachmentId, { ...defaultHeaders, Cookie: member.sessionCookie });
    expect(byMember.status).toBe(403);
    expect(byMember.body.type).toBe('forbidden');

    // A read-only key reads the attachment, and its update is refused as an action on a readable row.
    expect((await read(attachmentId, machineHeaders(readOnlyKey))).status).toBe(200);
    const byReadOnlyKey = await rename(attachmentId, machineHeaders(readOnlyKey));
    expect(byReadOnlyKey.status).toBe(403);
    expect(byReadOnlyKey.body.type).toBe('forbidden');
  });
});
