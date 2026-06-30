import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'system',
  owner: 'cella',
  scope: ['backend'],
  description: `*System level* endpoints for administrative actions and platform wide functionality. These endpoints
    support operations such as user invitations, file uploads, and webhook handling.`,
});
