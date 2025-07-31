import type { Env } from '#/lib/context';
import { ApiError } from '#/lib/errors';
import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';

export const defaultHook: Hook<unknown, Env, '', unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    const { message, code } = result.error.issues[0];
    const type = `form.${code}` as const;
    throw new ApiError({ status: 403, severity: 'error', message, type, originalError: result.error });
  }
};
