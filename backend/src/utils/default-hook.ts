import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';

/**
 * Custom error types come from Zod refinements via `params.type`, so i18n keys resolve. A failed validation
 * is a malformed request, not a permission verdict, so it answers 400; 403 is reserved for authorization.
 */
export const defaultHook: Hook<unknown, Env, '', unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    const issue = result.error.issues[0];
    const { message, code } = issue;

    // superRefine with refineWithType carries a custom type, which has its own texts; otherwise fall back to
    // `form.{code}` with the validator's message.
    const customType = code === 'custom' && 'params' in issue ? (issue.params?.type as ErrorKey | undefined) : undefined;
    const type = customType ?? (`form.${code}` as ErrorKey);

    throw new AppError(400, type, 'error', { message: customType ? undefined : message, originalError: result.error });
  }
};
