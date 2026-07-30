import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'marketing',
  owner: 'app',
  scope: ['frontend'],
  description: 'Public about page. If not included, set appConfig.aboutUrl to an external URL.',
  optional: true,
});
