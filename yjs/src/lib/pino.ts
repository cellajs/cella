import { createWorkerLog } from 'shared/pino';
import { redactedFields } from '#/lib/redact-keys';
import { env } from '../env';

export const log = createWorkerLog('yjs', env, redactedFields);
