import {
  type BatchCreateAttachmentsResponse,
  batchCreateAttachments,
  getAttachment,
  type ListAttachmentsResponse,
  listAttachments,
  type PresignAttachmentUrlsResponse,
  presignAttachmentUrls,
} from 'sdk';
import { assumeMemberAttachmentPolicy } from 'shared/testing/member-policy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { tenantContext } from '#/db/tenant-context';
import { publishDraftAttachments } from '#/modules/attachment/attachment-queries';
import { getIsoDate } from '#/utils/iso-date';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { attachmentBody, insertAttachmentIn, joinAttachmentHome, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createFactorOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** A file uploaded into a document that is not published (`draft` at create) is its uploader's until a host publishes it. */
describe('Draft attachments', async () => {
  assumeMemberAttachmentPolicy({ read: 1, update: 'own', delete: 'own' });
  const call = await createAppClient();
  let organization: { id: string; tenantId: string };
  let uploader: { id: string; sessionCookie: string };
  let member: { id: string; sessionCookie: string };
  const draftId = generateId();
  const membersDraftId = generateId();

  const path = () => ({ tenantId: organization.tenantId, organizationId: organization.id });
  const as = (user: { sessionCookie: string }) => ({ ...defaultHeaders, Cookie: user.sessionCookie });

  const listedIds = async (user: { sessionCookie: string }) => {
    const { data } = await call(listAttachments, { path: path(), headers: as(user) });
    return (data as ListAttachmentsResponse).results.map(({ id }) => id);
  };
  const getStatus = async (user: { sessionCookie: string }, attachmentId: string) =>
    (await call(getAttachment, { path: { ...path(), attachmentId }, headers: as(user) })).response.status;
  const signedIds = async (user: { sessionCookie: string }, attachmentId: string) => {
    const { data } = await call(presignAttachmentUrls, { path: path(), body: { items: [{ attachmentId, variant: 'original' }] }, headers: as(user) });
    return (data as PresignAttachmentUrlsResponse).results.map((result) => result.attachmentId);
  };

  beforeAll(async () => {
    organization = await createTestOrganization();
    uploader = await createFactorOrgUser(call, organization.tenantId, organization.id, 'draft-uploader', adminRole);
    member = await createFactorOrgUser(call, organization.tenantId, organization.id, 'draft-member', memberRole);
    const home = await seedAttachmentHome(organization, uploader.id);
    await joinAttachmentHome(organization, home, member.id);

    const keys = { original: `${organization.id}/${uploader.id}/answers.pdf` };
    const { data, response } = await call(batchCreateAttachments, {
      path: path(),
      body: [attachmentBody(draftId, home, { keys, draft: true })],
      headers: as(uploader),
    });
    expect(response.status).toBe(201);
    expect((data as BatchCreateAttachmentsResponse).results[0]?.publishedAt).toBeNull();
    await insertAttachmentIn(home, { id: membersDraftId, tenantId: organization.tenantId, createdBy: member.id, publishedAt: null });
  });

  afterAll(async () => await clearSecurityTestData());

  it('must not list, get or sign a draft for another member', async () => {
    expect(await listedIds(member)).not.toContain(draftId);
    expect(await getStatus(member, draftId)).toBe(404);
    expect(await signedIds(member, draftId)).toEqual([]);
  });

  it('gets and signs a draft for its uploader, and lists it for no one', async () => {
    expect(await getStatus(uploader, draftId)).toBe(200);
    expect(await signedIds(uploader, draftId)).toEqual([draftId]);
    expect(await listedIds(uploader)).not.toContain(draftId);
  });

  it("publishes the uploader's own drafts for every reader and leaves another's", async () => {
    // What a host write in an app holds when it publishes: the request scope and the actor, inside the tenant transaction.
    const ctx = {
      var: { db: baseDb, tenantId: organization.tenantId, organizationId: organization.id, actor: { id: uploader.id } },
    } as unknown as ActorContext;
    const { after } = await tenantContext(ctx, (txCtx) => publishDraftAttachments(txCtx, { ids: [draftId, membersDraftId], now: getIsoDate() }));

    expect(after.map(({ id }) => id)).toEqual([draftId]);
    expect(await listedIds(member)).toContain(draftId);
    expect(await signedIds(member, draftId)).toEqual([draftId]);
  });
});
