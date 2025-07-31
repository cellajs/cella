import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';

export const defaultHook: Hook<unknown, Env, '', unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    const { message, code } = result.error.issues[0];
    const type = `form.${code}` as const;
    throw new AppError({ status: 403, severity: 'error', message, type, originalError: result.error });
  }
};
