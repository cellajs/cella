import { isStrategyEnabled } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const LmsConnectionsCard = lazyNamed(() => import('~/modules/connections/lms-connections-card'), 'LmsConnectionsCard');

defineFrontendModule({
  name: 'connections',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description:
    "An organization's LMS connections: the LTI platforms the app is registered at as an LTI tool, connected by a one-use registration link from organization settings.",
  tools: isStrategyEnabled('lti')
    ? [
        {
          id: 'lms-connections',
          label: 'c:lms_connections',
          order: 62,
          // Shown to organization admins: a connection lets a platform's people into the organization.
          requires: 'update',
          slot: 'organization.settings',
          render: (organization) => <LmsConnectionsCard organization={organization} />,
        },
      ]
    : [],
});
