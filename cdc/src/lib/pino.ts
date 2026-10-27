import { createWorkerLog } from 'shared/pino';
import { redactPaths } from '#/lib/redact-keys';
import { env } from '../env';

export const log = createWorkerLog('cdc', env, redactPaths);
