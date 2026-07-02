import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'me',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints scoped to the current user, meaning the user associated with the active session making
    the request. Unlike the users endpoints, which may operate on any user in the system, me endpoints act
    exclusively on the current user and follow a different authorization flow.`,
});
