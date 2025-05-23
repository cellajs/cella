import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import type { Env } from '#/lib/context';
import { logEvent } from '#/middlewares/logger/log-event';

export const defaultHook: Hook<unknown, Env, '', unknown> = (result, ctx) => {
  if (!result.success && result.error instanceof ZodError) {
    const message = result.error.issues[0].message;
    const type = result.error.issues[0].code;
    const path = result.error.issues[0].path[0];

    logEvent('Validation error', { error: message, path }, 'info');

    const error = {
      message,
      type,
      status: 403,
      severity: 'error',
      path,
      method: ctx.req.method,
    };
    return ctx.json({ success: false, error }, 403);
  }
};
