import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'requests',
  owner: 'cella',
  scope: 'both',
  description: `Endpoints for handling incoming *requests* such as contact form submissions, newsletter signups,
    and waitlist entries.`,
});
