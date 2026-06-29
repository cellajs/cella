import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'marketing',
  owner: 'cella',
  scope: 'frontend',
  description: 'Public marketing site (about, features, sync-engine, legal page). Legal dialog stays in auth.',
  optional: true,
});
