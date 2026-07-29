import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'requests',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for handling incoming requests such as contact form submissions, newsletter signups,
    and waitlist entries.`,
});
