import { appConfig } from 'shared';
import { createLogHelpers, createLogger } from 'shared/pino';
import { env } from '../env';

const isProduction = env.NODE_ENV === 'production';
const logger = createLogger({
  level: env.PINO_LOG_LEVEL,
  isProduction,
  isTest: env.NODE_ENV === 'test',
  enableOtelTransport: true,
  mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY,
  serviceName: `${appConfig.slug}-yjs`,
});

export const { logEvent, logError } = createLogHelpers(logger, isProduction);
