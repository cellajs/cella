import { defineFrontendModule } from '~/lib/module';
import { handleChannelDeleted } from '~/query/realtime/channel-deleted';

defineFrontendModule({
  name: 'entities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI shared across channel types, such as entity grids, tiles and settings pages.',
  signals: { 'channel.deleted': handleChannelDeleted },
});
