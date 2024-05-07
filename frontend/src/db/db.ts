import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { config } from 'config';

const client = postgres(
  config.mode === 'production'
    ? 'postgresql://prisma:proxy_password@3.75.158.163:65432/postgres'
    : 'postgres://postgres:proxy_password@0.0.0.0:65431/electric',
);

export const db = drizzle(client, {
  logger: config.debug,
});
