import { insertUsers } from '#/modules/user/user-queries';
import { registerBenchSeed } from '../registry';
import { userId } from './ids';
import { loadtestUser } from './user';
import { TOTAL_USERS } from './user-constants';

registerBenchSeed({
  kind: 'custom',
  name: 'users',
  order: 20,
  cleanup: async ({ client }) => {
    const ids = Array.from({ length: TOTAL_USERS }, (_, i) => userId(i));
    await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM actors WHERE id = ANY($1::uuid[])', [ids]);
  },
  seed: async ({ now, db }) => {
    const users = Array.from({ length: TOTAL_USERS }, (_, i) => ({ ...loadtestUser(i), createdAt: now }));
    await insertUsers({ var: { db } }, { users });
  },
});
