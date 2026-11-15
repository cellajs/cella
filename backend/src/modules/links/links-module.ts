import { defineBackendModule } from '#/lib/module';
import { linkHandlers } from '#/modules/links/links-handlers';

defineBackendModule({
  name: 'links',
  owner: 'cella',
  scope: ['backend'],
  routes: [{ path: '/links', app: linkHandlers }],
  description: `Share links: \`/{code}\` names a channel by the code it was given at creation, and \`/{code}/t42\` a
    numbered product in it. The routes serve the preview a module declares for it, which unfurls in chats and sends a
    browser on into the app.`,
});
