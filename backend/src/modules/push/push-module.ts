import { defineBackendModule } from '#/lib/module';
import { pushHandlers } from './push-handlers';

defineBackendModule({
  name: 'push',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Web Push delivery for the notification inbox: per-device subscriptions, VAPID key
    exposure and the sender that turns fresh notification rows into pushes for offline
    subscribers. Dormant unless has.push is on AND the deployment carries VAPID keys.`,
  routes: [{ path: '/push', app: pushHandlers }],
});
