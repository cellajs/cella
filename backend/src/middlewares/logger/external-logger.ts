import { getNodeLoggerLevel } from '#/utils/logger';
import { Logtail as BetterStackLogger } from '@logtail/node';
import { config, type Severity } from 'config';
import { env } from '../../env';

const opts = env.BETTERSTACK_INGESTING_HOST ? { endpoint: `https://${env.BETTERSTACK_INGESTING_HOST}` } : {};
const externalLogger = env.BETTERSTACK_SOURCE_TOKEN ? new BetterStackLogger(env.BETTERSTACK_SOURCE_TOKEN, opts) : undefined;

/**
 * Logs to BetterStack if logger is configured.
 * @param severity - Custom severity key (e.g., 'fatal', 'info')
 * @param message - Log message
 * @param context - Optional context object (metadata)
 */
export const logToExternal = (severity: Severity, message: string, meta?: object): void => {
  if (!externalLogger) return;

  const level = getNodeLoggerLevel(severity);
  externalLogger[level](message, { ...(meta ?? {}), severityCode: config.severityLevels[severity] });
};
