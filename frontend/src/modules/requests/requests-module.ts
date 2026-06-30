import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'requests',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for handling incoming requests such as contact form submissions and waitlist entries.',
});
