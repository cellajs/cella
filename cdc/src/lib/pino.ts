import { createWorkerLog } from 'shared/pino';
import { redactPaths } from '#/lib/redact-keys';
import { env } from '../env';

/** The worker's logger, with the backend's secret columns redacted. */
export const log = createWorkerLog('cdc', env, redactPaths);
