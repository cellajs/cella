import { registerBenchSeed } from '../registry';
import { TOTAL_USERS } from './ids';
import { hashToken, sessionToken } from './session-auth';
import { loadtestSession } from './user';

registerBenchSeed({
  table: 'sessions',
  order: 60,
  cleanupWhere: `id::text LIKE '00000000-0000-4000-a007%'`,
  rows: () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return Array.from({ length: TOTAL_USERS }, (_, i) => loadtestSession(i, hashToken(sessionToken(i)), expiresAt));
  },
});
