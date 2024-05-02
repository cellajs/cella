import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/*',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: 'postgres://postgres:proxy_password@localhost:65432/postgres',
  },
} satisfies Config;
