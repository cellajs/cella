import { createLogHelpers, createLogger } from 'shared/pino';
import { env } from '../env';

const isProduction = env.NODE_ENV === 'production';
const logger = createLogger({ level: env.PINO_LOG_LEVEL, isProduction, isTest: env.NODE_ENV === 'test', enableOtelTransport: true });

export const { logEvent, logError } = createLogHelpers(logger, isProduction);

