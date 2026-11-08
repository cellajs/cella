import { appConfig } from 'shared';
import { localDatabaseUrl } from 'shared/local-database';
import { envFlag, parseEnv } from 'shared/utils/parse-env';
import { loadRootEnv, workerEnvBase } from 'shared/utils/worker-env';
import { yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { z } from 'zod';

loadRootEnv(import.meta.url);

const envSchema = workerEnvBase.extend({
  // A local stack defaults to the dev container; a deployed one receives it as a runtime secret.
  DATABASE_URL: appConfig.isLocal ? z.url().default(localDatabaseUrl('dev', 'runtime_role')) : z.url(),

  // The public half of the backend's token key: verifies editor tokens, cannot sign one.
  YJS_TOKEN_PUBLIC_KEY: z.string().refine(
    (value) => {
      try {
        yjsTokenVerifyKey(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'YJS_TOKEN_PUBLIC_KEY must be a base64url Ed25519 public key' },
  ),
  // Authenticates the relay on the backend's internal materialize route.
  YJS_RELAY_SECRET: z.string().min(16, 'YJS_RELAY_SECRET must be at least 16 characters'),
  // The backend's internal listener; its routes are not on the public API.
  BACKEND_INTERNAL_URL: z.url().default(`http://localhost:${appConfig.services.backend.internalPort}`),
  // The log listener holds one more connection, outside this pool.
  YJS_DATABASE_POOL_MAX: z.coerce.number().default(10),

  // A relay without a database: in-memory connection limiter, no TLS CA requirement, no log listener and no sweep.
  NODB: envFlag('false'),
});

/** The relay's environment, parsed at import: a missing or malformed variable stops the relay before it listens. */
export const env = parseEnv(envSchema, process.env);
