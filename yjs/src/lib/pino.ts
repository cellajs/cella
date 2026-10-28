import { createWorkerLog } from 'shared/pino';
import { redactPaths } from '#/lib/redact-keys';
import { env } from '../env';

/** The relay's logger, service `yjs`, with the backend's secret columns redacted. */
export const log = createWorkerLog('yjs', env, redactPaths);
