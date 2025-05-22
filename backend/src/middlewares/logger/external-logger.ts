import { Logtail as BetterStackLogger } from '@logtail/node';
import { env } from '../../env';

const opts = env.BETTERSTACK_INGESTING_HOST ? { endpoint: `https://${env.BETTERSTACK_INGESTING_HOST}` } : {};

export const externalLogger = env.BETTERSTACK_SOURCE_TOKEN ? new BetterStackLogger(env.BETTERSTACK_SOURCE_TOKEN, opts) : undefined;
