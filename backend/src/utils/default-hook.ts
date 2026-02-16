import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import type { Env } from '#/lib/context';
import { AppError, type ErrorKey } from '#/lib/error';

/**
 * Default validation hook for zod-openapi routes.
 * Extracts custom error types from Zod refinements via params.type for proper i18n support.
 */
export const defaultHook: Hook<unknown, Env, '', unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    const issue = result.error.issues[0];
    const { message, code } = issue;

    // Extract custom type from params if available (for superRefine with refineWithType)
    // Otherwise fall back to generic form.{code} type
    let type: ErrorKey;
    if (code === 'custom' && 'params' in issue && issue.params?.type) {
      type = issue.params.type as ErrorKey;
    } else {
      type = `form.${code}` as ErrorKey;
    }

    throw new AppError(403, type, 'error', { message, originalError: result.error });
  }
};
