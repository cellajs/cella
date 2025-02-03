import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import type { Env } from '#/lib/context';
import { logEvent } from '#/middlewares/logger/log-event';

const defaultHook: Hook<unknown, Env, '', unknown> = (result, ctx) => {
  if (!result.success && result.error instanceof ZodError) {
    logEvent(
      'Validation error',
      {
        error: result.error.issues[0].message,
        path: result.error.issues[0].path[0],
      },
      'info',
    );

    return ctx.json({ success: false, error: result.error.issues[0].message }, 400);
  }
};

export default defaultHook;
