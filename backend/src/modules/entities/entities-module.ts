import { defineBackendModule } from '#/lib/module';
import { entityHandlers } from '#/modules/entities/entities-handlers';
import { clearDeletedStorage } from '#/modules/entities/operations/clear-deleted-storage';
import { publicCascadeHandlers } from '#/permissions/public-cascade';

defineBackendModule({
  name: 'entities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints that operate across multiple entity types, such as users and organizations.
    Entities are identifiable domain objects that may be contextual, hierarchical (with parent/child
    relations), or actor-like. These routes check slug availability and serve the stream and its catchup,
    which tell a signed-in client about changes to the entities it may read and send it signals about the rest.`,
  // Hourly, at the three-quarter offset clear of the digest's tick.
  jobs: [{ name: 'deleted-storage-cleanup', cron: '45 * * * *', run: () => clearDeletedStorage() }],
  routes: [{ path: '/', app: entityHandlers }],
  // A product with a public read grant follows its home channel's `public`; none in the template, so no handler.
  onMutation: publicCascadeHandlers(),
  // `channel.deleted`: sent by the entities stream listeners when a channel below the organization is deleted
  // (`versionedSignalsOf`). `channel.archived`: sent by the archive route to the channel's readers, unversioned, since a
  // client that was away refetches its channel lists at catchup.
  signals: [
    { type: 'channel.deleted', audiences: ['readers'] },
    { type: 'channel.archived', audiences: ['readers'] },
  ],
});
