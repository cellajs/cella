import { appConfig } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import * as membershipOps from '~/query/realtime/membership-ops';
import { appStreamManager } from '~/query/realtime/stream-manager';
import { syncStore } from '~/query/realtime/sync-store';

defineFrontendModule({
  name: 'memberships',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing user memberships in channels.',
  signals: {
    'membership.changed': ({ organizationId, subjectId }) => {
      // Without a subject the signal is about the organization's memberships as a whole: its member lists.
      membershipOps.invalidateMemberQueries(organizationId);
      if (!subjectId) return;

      // One of the user's own memberships: its channel lists, its memberships and the permissions they grant.
      for (const channelType of appConfig.channelEntityTypes) membershipOps.invalidateChannelList(channelType);
      membershipOps.invalidateMemberships();
      membershipOps.refreshMe();

      // A membership in an organization the stream never registered on: reconnect to register there.
      if (organizationId && !syncStore.getState().orgs[organizationId]) appStreamManager.reconnect();
    },
  },
});
