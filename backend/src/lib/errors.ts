import { ParseKeys, i18n } from './i18n';

export const createError = (code: ParseKeys<'backend'>, defaultValue?: string) => ({
  success: false,
  error: i18n.t(code, {
    defaultValue,
  }) as string,
});

export const unauthorizedError = () => createError('error.unauthorized', 'Unauthorized');

export const forbiddenError = () => createError('error.forbidden', 'Forbidden');

export const tooManyRequestsError = () => createError('error.too_many_requests', 'Too many requests');
