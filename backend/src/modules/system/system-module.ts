import { defineBackendModule } from '#/lib/module';
import { systemHandlers } from '#/modules/system/system-handlers';

defineBackendModule({
  name: 'system',
  owner: 'cella',
  scope: ['backend'],
  description: `System level endpoints for system admins: inviting users to the app by email, updating and deleting
    any user, and sending a newsletter to the members of chosen organizations.`,
  routes: [{ path: '/system', app: systemHandlers }],
});
