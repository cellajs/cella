import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'activities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  hidden: true,
  description: `Endpoints for retrieving activities, which are audit log entries tracking create, update, and
    delete operations across all resources. Activities provide an audit trail and can be extended for webhook
    delivery.`,
});
