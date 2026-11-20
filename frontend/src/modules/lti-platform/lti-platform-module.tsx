import { appConfig } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const LtiToolsCard = lazyNamed(() => import('~/modules/lti-platform/lti-tools-card'), 'LtiToolsCard');

defineFrontendModule({
  name: 'lti-platform',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description:
    "The app as an LTI platform: an organization admin adds and approves LTI tools in settings and sees where each has tabs, a channel's Tabs card places, removes and orders their tabs with its own, its tab bar adds one, and each tab opens its LTI tool in a launch frame that answers the LTI tool's platform storage messages.",
  ...(appConfig.has.ltiPlatform && {
    tools: [
      {
        id: 'lti-tools',
        label: 'c:lti_tools',
        order: 61,
        // Shown to organization admins: installing an LTI tool makes a machine actor, as an API key does.
        requires: 'update',
        slot: 'organization.settings',
        render: (organization) => <LtiToolsCard organization={organization} />,
      },
    ],
  }),
});
