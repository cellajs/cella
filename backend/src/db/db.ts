import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from 'env';
import postgres from 'postgres';

import * as schema from './schema';

export const queryClient = postgres(env.DATABASE_URL ?? '', {
  onnotice: () => {},
});

export const db = drizzle(queryClient, {
  schema,
  // logger: config.mode === 'development',
});
