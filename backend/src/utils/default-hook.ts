import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod/v4';
import type { Env } from '#/lib/context';
import { ApiError, type ErrorKey } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';

export const defaultHook: Hook<unknown, Env, '', unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    const { message, code } = result.error.issues[0];
    logEvent('Validation error', { error: message }, 'info');

    throw new ApiError({ status: 403, severity: 'error', message, type: `form.${code}` as ErrorKey, originalError: result.error });
  }
};
