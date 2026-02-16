import type { Context } from 'hono';
import { cdcLogger } from '../pino';

/**
 * Lightweight error class for CDC worker.
 * Simplified version of backend AppError - no i18n, no complex metadata.
 */
export class CdcError extends Error {
  readonly status: number;
  readonly type: string;
  readonly severity: 'error' | 'warn' | 'fatal';

  constructor(status: number, type: string, message: string, severity: 'error' | 'warn' | 'fatal' = 'error') {
    super(message);
    this.name = 'CdcError';
    this.status = status;
    this.type = type;
    this.severity = severity;
  }
}

/**
 * Hono error handler for CDC endpoints.
 * Logs errors and returns structured JSON responses.
 *
 * @param err - The error that was thrown
 * @param c - Hono context
 * @returns JSON error response
 */
export const cdcErrorHandler = (err: Error, c: Context): Response => {
  const isCdcError = err instanceof CdcError;

  const status = isCdcError ? err.status : 500;
  const type = isCdcError ? err.type : 'internal_error';
  const severity = isCdcError ? err.severity : 'error';

  cdcLogger[severity]({
    msg: err.message,
    type,
    status,
    stack: err.stack,
  });

  return c.json({ error: type, message: err.message }, status as 500);
};
