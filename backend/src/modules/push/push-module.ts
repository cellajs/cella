import { defineBackendModule } from '#/lib/module';
import { pushHandlers } from '#/modules/push/push-handlers';

defineBackendModule({
  name: 'push',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Web Push delivery for the notification inbox: per-device subscriptions, VAPID key
    exposure and the sender that turns fresh notification rows into pushes for offline
    subscribers. Dormant unless has.push is on and the deployment carries VAPID keys and a subject that web-push accepts.`,
  routes: [{ path: '/push', app: pushHandlers }],
});
