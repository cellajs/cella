import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'requests',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for handling incoming requests such as contact form submissions, newsletter signups,
    and waitlist entries.`,
});
