import { t } from 'i18next';
import { createElement } from 'react';
import type { FieldError, FieldErrors, FieldValues, ValidateResult } from 'react-hook-form';
import type { TKey } from '~/lib/i18n-locales';
import { toaster } from '~/modules/common/toaster/toaster';

export const defaultOnInvalid = <TFieldValues extends FieldValues>(errors: FieldErrors<TFieldValues>) => {
  const messages = processErrors(errors);

  if (messages.length === 0) return;

  toaster.error(t('error:form.invalid_form'), {
    description: createElement(
      'div',
      null,
      messages.map((msg, i) => createElement('p', { key: i }, msg)),
    ),
  });

  console.error('Form validation failed', errors);
};

const processErrors = <TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  parentFieldName?: string,
): string[] => {
  const messages: string[] = [];

  for (const [name, value] of Object.entries(errors)) {
    if (!value) continue;

    const fieldName = parentFieldName ? `${parentFieldName}.${name}` : name;
    const label = resolveFieldLabel(fieldName);

    if ('message' in value || 'type' in value || 'types' in value) {
      const error = value as FieldError;

      if (error.types) {
        for (const [subType, subMsg] of Object.entries(error.types)) {
          const message = resolveErrorMessage(subType, subMsg);
          messages.push(`${label}: ${message}`);
        }
      } else {
        const message = resolveErrorMessage(error.type, error.message);
        messages.push(`${label}: ${message}`);
      }
    } else {
      messages.push(...processErrors(value as FieldErrors<TFieldValues>, fieldName));
    }
  }

  return messages;
};

// Resolve a camelCase field name to a translated label via c:{snake_case} convention
const resolveFieldLabel = (fieldName: string): string => {
  const leaf = fieldName.includes('.') ? fieldName.split('.').pop()! : fieldName;
  const key = leaf.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  const translated = t(`c:${key}` as TKey);
  // If i18next returns the key itself, fall back to the raw field name
  return translated !== key && translated !== `c:${key}` ? translated : fieldName;
};

const resolveErrorMessage = (type?: string, message?: ValidateResult): string => {
  const fallback = typeof message === 'string' ? message : 'Unknown';
  return type ? t(`error:form.${type}`, fallback) : fallback;
};
