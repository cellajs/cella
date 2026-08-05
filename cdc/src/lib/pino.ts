import { createWorkerLog } from 'shared/pino';
import { env } from '../env';

export const log = createWorkerLog('cdc', env);
