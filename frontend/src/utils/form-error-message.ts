import i18n, { t } from 'i18next';
import type { z } from 'zod';

type Issue = z.core.$ZodRawIssue;

const isBlank = (input: unknown) =>
  input === undefined || input === null || (typeof input === 'string' && input.trim() === '') || (Array.isArray(input) && input.length === 0);

/** The characters of `input` that a pattern made of one character class (`/^[...]+$/`) refuses, so the message can name them. */
const refusedChars = (pattern: string | undefined, input: unknown) => {
  const match = pattern && /^\/\^\[(.+)\][+*]\$\/([a-z]*)$/.exec(pattern);
  if (!match || typeof input !== 'string') return [];
  const allowed = new RegExp(`^[${match[1]}]$`, match[2]);
  return [...new Set(input)].filter((char) => char.trim() && !allowed.test(char));
};

const formatMessage = (issue: Extract<Issue, { code: 'invalid_format' }>) => {
  if (issue.format === 'email') return t('error:invalid_email');
  if (issue.format === 'url') return t('error:form.url');
  if (issue.format === 'starts_with' && 'prefix' in issue) return t('error:form.starts_with', { prefix: issue.prefix });

  const chars = refusedChars(issue.pattern, issue.input).map((char) => `“${char}”`);
  if (chars.length) return t('error:form.remove_chars', { chars: new Intl.ListFormat(i18n.resolvedLanguage, { type: 'conjunction' }).format(chars) });
  return isBlank(issue.input) ? t('error:form.required') : t('error:form.format');
};

const sizeMessage = (issue: Extract<Issue, { code: 'too_small' | 'too_big' }>) => {
  const small = issue.code === 'too_small';

  if (issue.origin === 'number' || issue.origin === 'int') {
    const bound = Number(small ? issue.minimum : issue.maximum);
    if (small) return issue.inclusive === false ? t('error:form.number_above', { min: bound }) : t('error:form.number_min', { min: bound });
    return issue.inclusive === false ? t('error:form.number_below', { max: bound }) : t('error:form.number_max', { max: bound });
  }

  if (small && (isBlank(issue.input) || Number(issue.minimum) <= 1)) return t('error:form.required');
  if (issue.origin === 'string') return small ? t('error:form.too_short', { min: issue.minimum }) : t('error:form.too_long', { max: issue.maximum });
  if (issue.origin === 'array' || issue.origin === 'set') {
    return small ? t('error:form.too_few', { min: issue.minimum }) : t('error:form.too_many', { max: issue.maximum });
  }
  return t('error:form.not_accepted');
};

/**
 * The text of a validation issue in plain, translated words that say what to do. Registered as zod's `customError`,
 * so it covers every schema without a message of its own, the generated SDK schemas included.
 */
export const formErrorMessage = (issue: Issue): string => {
  switch (issue.code) {
    case 'invalid_type':
      if (isBlank(issue.input)) return t('error:form.required');
      return issue.expected === 'number' || issue.expected === 'int' ? t('error:form.number') : t('error:form.not_accepted');
    case 'too_small':
    case 'too_big':
      return sizeMessage(issue);
    case 'invalid_format':
      return formatMessage(issue);
    case 'invalid_value':
      return isBlank(issue.input) ? t('error:form.required') : t('error:form.choose_option');
    case 'not_multiple_of':
      return t('error:form.multiple_of', { divisor: issue.divisor });
    default:
      return t('error:form.not_accepted');
  }
};
