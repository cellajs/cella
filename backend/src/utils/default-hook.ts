import type { Hook } from '@hono/zod-openapi';
import { ZodError } from 'zod';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';

/**
 * Default validation hook for zod-openapi routes.
 * Extracts custom error types from Zod refinements via params.type for proper i18n support.
 */
export const defaultHook: Hook<unknown, Env, '', unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    // Prefer a typed issue (one carrying `params.type` from refineWithType) when
    // present — built-in checks like `.regex` may fire alongside our typed
    // superRefine; the typed message is the user-facing one we want.
    const typedIssue = result.error.issues.find(
      (i) => 'params' in i && (i as { params?: { type?: unknown } }).params?.type,
    );
    const issue = typedIssue ?? result.error.issues[0];
    const { message, code } = issue;

    const paramsType = 'params' in issue ? (issue as { params?: { type?: unknown } }).params?.type : undefined;
    const type: ErrorKey = typeof paramsType === 'string' ? (paramsType as ErrorKey) : (`form.${code}` as ErrorKey);

    throw new AppError(403, type, 'error', { message, originalError: result.error });
  }
};
