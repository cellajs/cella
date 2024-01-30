import { ParseKeys, getI18n } from 'i18n';

type i18n = ReturnType<typeof getI18n>;

export const createError = (i18n: i18n, code: ParseKeys<'backend'>, defaultValue?: string) => ({
  success: false,
  error: i18n.t(code, {
    ns: 'backend',
    defaultValue,
  }) as string,
});

export const unauthorizedError = (i18n: i18n) => createError(i18n, 'error.unauthorized', 'Unauthorized');

export const forbiddenError = (i18n: i18n) => createError(i18n, 'error.forbidden', 'Forbidden');

export const tooManyRequestsError = (i18n: i18n) => createError(i18n, 'error.too_many_requests', 'Too many requests');