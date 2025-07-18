import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import type { Env } from '#/lib/context';
import { ApiError, type ErrorKey } from '#/lib/errors';

export const defaultHook: Hook<unknown, Env, '', unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    const { message, code } = result.error.issues[0];
    throw new ApiError({ status: 403, severity: 'error', message, type: `form.${code}` as ErrorKey, originalError: result.error });
  }
};
