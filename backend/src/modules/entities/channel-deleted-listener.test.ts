import { describe, expect, it, vi } from 'vitest';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { sendSignal } from '#/modules/entities/stream/send-signal';
import './entities-listeners';

// The template's one channel is the organization: a project below it stands in for the channels of an app.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const hierarchy = actual
    .createEntityHierarchy(actual.roles)
    .user()
    .organization({ roles: actual.roles.all, elevated: ['admin'], drafts: { prepareRoles: ['admin'] } })
    .channel('project', { parent: 'organization', roles: actual.roles.all })
    .product('attachment', { parent: 'organization' })
    .build();
  return {
    ...actual,
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
    appConfig: { ...actual.appConfig, entityTypes: hierarchy.allTypes, channelEntityTypes: hierarchy.channelTypes },
  };
});

vi.mock('#/modules/entities/stream/send-signal', () => ({ sendSignal: vi.fn() }));

const org = 'org-channel-deleted';

// The subject is built on the app's own hierarchy: every channel column it may ask for is present, null where unused.
const { appConfig: ownConfig } = await vi.importActual<typeof import('shared')>('shared');
const unusedChannelColumns = Object.fromEntries(
  ownConfig.channelEntityTypes.filter((type) => type !== 'organization').map((type) => [ownConfig.entityIdColumnKeys[type], null]),
);

/** A channel change as the CDC worker sends it: the rows its delete cascaded to send none, and the delete moves the version of `channel.deleted`. */
const projectEvent = (action: 'update' | 'delete') =>
  ({
    ...(action === 'delete' && { signalVersions: { 'channel.deleted': 7 } }),
    id: `activity-${action}-project`,
    type: action === 'delete' ? 'project.deleted' : 'project.updated',
    action,
    entityType: 'project',
    resourceType: null,
    tableName: 'projects',
    subjectId: 'project-1',
    tenantId: 'tenant-1',
    organizationId: org,
    rowData: { ...unusedChannelColumns, id: 'project-1', organizationId: org, createdBy: null },
    rows: null,
    trace: null,
    stx: null,
  }) as unknown as ActivityEvent; // A fixture of the fields the listener reads, not a whole activity row.

describe('entities listeners: a channel below the organization is deleted', () => {
  it('names the channel to its own readers only, never to every reader of the organization, with the version its delete gave the signal', async () => {
    activityBus.emit(projectEvent('update'));
    activityBus.emit(projectEvent('delete'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The worker moves the version of the same type at the delete, which catchup returns to a client that was away.
    expect(vi.mocked(sendSignal).mock.calls).toEqual([
      [
        'channel.deleted',
        { kind: 'readers', action: 'read', subject: expect.objectContaining({ entityType: 'project', id: 'project-1' }) },
        { organizationId: org, subjectId: 'project-1', version: 7 },
      ],
    ]);
  });
});
