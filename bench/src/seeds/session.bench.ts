import { registerBenchSeed } from '../registry';
import { CORE_ID_VARIANTS } from './ids';
import { hashToken, sessionToken } from './session-auth';
import { loadtestSession } from './user';
import { TOTAL_USERS } from './user.bench';

registerBenchSeed({
  table: 'sessions',
  order: 60,
  idVariant: CORE_ID_VARIANTS.session,
  rows: () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return Array.from({ length: TOTAL_USERS }, (_, i) => loadtestSession(i, hashToken(sessionToken(i)), expiresAt));
  },
});
