import { SearchParamError } from '@tanstack/react-router';
import i18n from 'i18next';
import type { RefObject } from 'react';
import { ApiError } from '~/lib/api';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';

export type ErrorNoticeError = ApiError | Error | null;

export const handleAskForHelp = (ref: RefObject<HTMLButtonElement | null>) => {
  if (!window.Gleap) return contactFormHandler(ref);
  window.Gleap.openConversations();
};

/**
 * Returns a locale key string based on the error type or query.
 */
function getErrorLocaleKey(error?: ErrorNoticeError, errorFromQuery?: string): string {
  if (errorFromQuery) return errorFromQuery;
  if (!error) return 'error';

  if (error instanceof SearchParamError) return 'invalid_param';

  if (error instanceof ApiError)
    return error.entityType && error.type ? `resource_${error.type}` : error.type || error.name;

  return error.name;
}

/**
 * Returns localized error info (title and message) for a given error.
 */
export const getErrorInfo = ({ error, errorFromQuery }: { error?: ErrorNoticeError; errorFromQuery?: string }) => {
  const localeKey = getErrorLocaleKey(error, errorFromQuery);

  const translationOptions = {
    ns: ['error'],
    ...(error instanceof ApiError && error.entityType
      ? { resource: i18n.t(error.entityType), resourceLowerCase: i18n.t(error.entityType).toLowerCase() }
      : {}),
  };

  const defaultTitle = error?.name || i18n.t('error:error');
  const defaultMessage = error?.message || '';

  // Title translation
  const title = i18n.t(localeKey, { ...translationOptions, defaultValue: defaultTitle });

  // Message translation with severity check (type-safe)
  const message =
    error && 'severity' in error && error.severity === 'info'
      ? error.message
      : i18n.t(`${localeKey}.text`, { ...translationOptions, defaultValue: defaultMessage });

  return { title, message };
};
