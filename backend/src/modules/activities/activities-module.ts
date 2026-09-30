import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'activities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  hidden: true,
  description: `Audit log entries tracking create, update, and delete operations across all resources, written
    by the CDC worker. Activities provide an audit trail and can be extended for webhook delivery.`,
});
