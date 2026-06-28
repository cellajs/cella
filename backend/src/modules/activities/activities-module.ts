import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'activities',
  owner: 'cella',
  scope: 'both',
  description: `Endpoints for retrieving activities (audit log entries). Activities track create, update, and
    delete operations across all resources. This serves as an audit trail and can be extended for webhook
    delivery.`,
});
