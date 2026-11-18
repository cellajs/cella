import { appConfig } from 'shared';
import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const LtiToolsCard = lazyNamed(() => import('~/modules/lti-platform/lti-tools-card'), 'LtiToolsCard');

defineFrontendModule({
  name: 'lti-platform',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description:
    "The app as an LTI platform: an organization admin adds, approves and places LTI tools in settings, a channel's LTI resource links show as its tabs, and each opens its LTI tool in a launch frame that answers the LTI tool's platform storage messages.",
  tools: appConfig.has.ltiPlatform
    ? [
        {
          id: 'lti-tools',
          label: 'c:lti_tools',
          order: 61,
          // Shown to organization admins: installing an LTI tool makes a machine actor, as an API key does.
          requires: 'update',
          slot: 'organization.settings',
          render: (organization) => <LtiToolsCard organization={organization} />,
        },
      ]
    : [],
});
