import { defineFrontendModule } from '~/lib/module';
import { lazyNamed } from '~/utils/lazy-named';

const HomeChannels = lazyNamed(() => import('~/modules/home/home-channels'), 'HomeChannels');

defineFrontendModule({
  name: 'home',
  owner: 'cella',
  scope: ['frontend'],
  description: 'Home page and landing UI components.',
  tools: [
    // Links to every channel of the user; an app that shows its own drops it from appConfig.surfaces['home.sections']
    { id: 'channels', label: 'c:organization_other', slot: 'home.sections', render: (user) => <HomeChannels userId={user.id} /> },
  ],
});
