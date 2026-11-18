import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'lti-platform',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description:
    "The app as an LTI platform: a channel's LTI resource links show as its tabs, and each opens its LTI tool in a launch frame that answers the LTI tool's platform storage messages.",
});
