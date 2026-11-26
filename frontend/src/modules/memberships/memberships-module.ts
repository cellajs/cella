import { appConfig } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import * as membershipOps from '~/query/realtime/membership-ops';
import { streamManager } from '~/query/realtime/stream-manager';
import { syncStore } from '~/query/realtime/sync-store';

defineFrontendModule({
  name: 'memberships',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing user memberships in channels.',
  signals: {
    'membership.changed': ({ organizationId, subjectId }) => {
      // A membership in an organization the stream never registered on: reconnect to register there.
      if (subjectId && organizationId && !syncStore.getState().orgs[organizationId]) streamManager.reconnect();
      // The echo of the user's own write: its answer is in the cache, and the organization's signal refreshes the counts.
      if (subjectId && membershipOps.isOwnMembershipEcho(subjectId)) return;

      // Without a subject the signal is about the organization's memberships as a whole: its member lists and the counts on its channels.
      membershipOps.invalidateMemberQueries(organizationId);
      membershipOps.invalidateChannelDetails(organizationId);
      if (!subjectId) return;

      // One of the user's own memberships: its channel lists, its memberships and the permissions they grant.
      for (const channelType of appConfig.channelEntityTypes) membershipOps.invalidateChannelList(channelType);
      membershipOps.invalidateMemberships();
    },
  },
});
