import { SearchParamError } from '@tanstack/react-router';
import i18n from 'i18next';
import { ApiError } from '~/lib/api';
import type { TKey } from '~/lib/i18n-locales';

/** What an error page or toast describes: a failed API call, any other thrown error, or nothing at all. */
export type ErrorNoticeError = ApiError | Error | null;

/** What a status means, for an error that has no type and no name of its own, as a proxy's answer has none. */
const statusKeys: Partial<Record<number, TKey>> = {
  400: 'error:bad_request_action',
  401: 'error:unauthorized_action',
  403: 'error:forbidden_action',
  404: 'error:not_found',
  429: 'error:too_many_requests',
};

const isKnown = (key: string) => i18n.exists(`error:${key}`);

/**
 * The keys in `error.json` that may describe the error, most specific first. An error names itself; the route's
 * `error` search param names it only when there is none.
 */
function getErrorLocaleKeys(error?: ErrorNoticeError, errorFromQuery?: string): string[] {
  if (!error) return [errorFromQuery || 'error'];

  if (error instanceof SearchParamError) return ['invalid_param'];

  if (!(error instanceof ApiError)) return [error.name];
  if (!error.type) return [];

  return error.entityType ? [`resource_${error.type}`, error.type] : [error.type];
}

/** Title for an error no key describes: the name the server gave it, else what its status means. */
function getFallbackTitle(error?: ErrorNoticeError): string {
  if (!(error instanceof ApiError)) return error?.name || i18n.t('error:error');

  // An ApiError built without a name carries its type or the class name in its place.
  if (error.name !== 'ApiError' && error.name !== error.type) return error.name;

  const statusKey = statusKeys[error.status];
  return i18n.t(statusKey ?? 'error:error');
}

/** The sentence the error brought along. An ApiError built without one carries its type, name or status in its place. */
export function getOwnMessage(error?: ErrorNoticeError): string {
  if (!error) return '';
  if (!(error instanceof ApiError)) return error.message;

  const standIns: (string | undefined)[] = [error.type, error.name, `HTTP ${error.status}`];
  return standIns.includes(error.message) ? '' : error.message;
}

/**
 * Title and explanation of an error, the same on the error page and in a toast. The title is the translation of the
 * error's type, in its `resource_` form first when the error names an entity type. The message is that key's `.text`
 * sentence, or the sentence the server sent when the key has none; an `info` error always shows the server's sentence.
 * An error no key describes, such as an app's own type, takes the name and message the server gave it.
 * @param args - The error, or an error type read from the `error` search param after a redirect.
 * @returns `title`, and `message`: empty when it would add nothing to the title.
 */
export const getErrorInfo = ({ error, errorFromQuery }: { error?: ErrorNoticeError; errorFromQuery?: string }) => {
  const key = getErrorLocaleKeys(error, errorFromQuery).find(isKnown);

  const resource = error instanceof ApiError && error.entityType ? i18n.t(error.entityType) : undefined;
  const options = resource ? { resource, resourceLowerCase: resource.toLowerCase() } : {};

  const title = key ? i18n.t(`error:${key}` as TKey, options) : getFallbackTitle(error);

  const ownMessage = getOwnMessage(error);
  const isInfo = !!error && 'severity' in error && error.severity === 'info';
  const text = key && !isInfo && isKnown(`${key}.text`) ? i18n.t(`error:${key}.text` as TKey, options) : ownMessage;

  return { title, message: text === title ? '' : text };
};
