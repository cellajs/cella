import { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import { Env } from '../types/common';
import { customLogger } from './custom-logger';

const defaultHook: Hook<unknown, Env, '', unknown> = (result, ctx) => {
  if (!result.success && result.error instanceof ZodError) {
    customLogger(
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
