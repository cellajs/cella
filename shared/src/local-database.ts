import process from 'node:process';
import { config } from '../config/config.default.ts';

/**
 * The PostgreSQL containers of `backend/compose.yaml`, by purpose: `dev` for `pnpm dev`, `test` for the suites and
 * `a11y` for the accessibility audit. Their ports follow the app's number, as the service ports do, so two apps run
 * their databases side by side; a linked worktree shares the main checkout's. Every checkout of the app mounts them
 * under the default config's slug.
 */
export type LocalDatabase = 'dev' | 'test' | 'a11y';

/** The ports of app number 0; the last digit tells the three apart, and `devAppIndex` adds ten times its number. */
const basePorts: Record<LocalDatabase, number> = { dev: 5432, test: 5434, a11y: 5470 };

/** The env variable that points a purpose at another server, such as a throwaway test database on a port of its own. */
const portEnvNames: Record<LocalDatabase, string> = { dev: 'DB_PORT', test: 'DB_TEST_PORT', a11y: 'DB_A11Y_PORT' };

/** The roles `backend/compose.yaml` and the backend's role setup create, with their passwords. */
const passwords = { postgres: 'postgres', runtime_role: 'dev_password', admin_role: 'dev_password' } as const;

export type LocalDatabaseRole = keyof typeof passwords;

/** The host port `database` listens on for this app; its env variable, when set, wins. */
export const localDatabasePort = (database: LocalDatabase): number =>
  // biome-ignore lint/style/noProcessEnv: read before any env module exists, by the vitest configs and the compose wrapper.
  Number(process.env[portEnvNames[database]]) || basePorts[database] + config.devAppIndex * 10;

/** A connection URL for `database` as `role`; `name` is the database inside the server, `postgres` by default. */
export const localDatabaseUrl = (database: LocalDatabase, role: LocalDatabaseRole, name = 'postgres'): string =>
  `postgres://${role}:${passwords[role]}@0.0.0.0:${localDatabasePort(database)}/${name}`;

/** The env `backend/compose.yaml` reads: the project name and the host port of each database. */
export const composeEnv = (): Record<string, string> => ({
  PROJECT_SLUG: config.slug,
  ...Object.fromEntries((Object.keys(basePorts) as LocalDatabase[]).map((database) => [portEnvNames[database], String(localDatabasePort(database))])),
});
