import { isStrategyEnabled } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const LtiConnectionsCard = lazyNamed(() => import('~/modules/connections/lti-connections-card'), 'LtiConnectionsCard');

defineFrontendModule({
  name: 'connections',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description:
    "An organization's LTI connections: the LTI platforms the app is registered at as an LTI tool, connected by a one-use registration link from organization settings.",
  tools: isStrategyEnabled('lti')
    ? [
        {
          id: 'lti-connections',
          label: 'c:lti_connections',
          order: 62,
          // Shown to organization admins: a connection lets a platform's people into the organization.
          requires: 'update',
          slot: 'organization.settings',
          render: (organization) => <LtiConnectionsCard organization={organization} />,
        },
      ]
    : [],
});
