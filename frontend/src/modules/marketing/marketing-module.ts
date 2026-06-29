import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'marketing',
  owner: 'cella',
  scope: 'frontend',
  description: 'Public about page. If not included, set appConfig.aboutUrl to an external URL.',
  optional: true,
});
