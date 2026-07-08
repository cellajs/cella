import { t } from 'i18next';
import { createElement } from 'react';
import type { FieldError, FieldErrors, FieldValues, ValidateResult } from 'react-hook-form';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Handles invalid form submissions. Extracting and displaying error messages, and logging them.
 */
export const defaultOnInvalid = <TFieldValues extends FieldValues>(errors: FieldErrors<TFieldValues>) => {
  const messages = processErrors(errors);

  if (messages.length === 0) return;

  // Display a toaster with a list of validation errors
  toaster(t('error:form.invalid_form'), 'error', {
    description: createElement(
      'div',
      null,
      messages.map((msg, i) => createElement('p', { key: i }, msg)),
    ),
  });

  console.error('Form validation failed', errors);
};

// Recursively build a list of readable error message from FieldErrors object
const processErrors = <TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  parentFieldName?: string,
): string[] => {
  const messages: string[] = [];

  for (const [name, value] of Object.entries(errors)) {
    if (!value) continue;

    const fieldName = parentFieldName ? `${parentFieldName}.${name}` : name;
    const label = resolveFieldLabel(fieldName);

    // Leaf node error with 'type', 'message', or 'types'
    if ('message' in value || 'type' in value || 'types' in value) {
      const error = value as FieldError;

      // Multiple error types
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
      // Nested field group (e.g. field arrays or nested objects)
      messages.push(...processErrors(value as FieldErrors<TFieldValues>, fieldName));
    }
  }

  return messages;
};

// Resolve a camelCase field name to a translated label via c:{snake_case} convention
const resolveFieldLabel = (fieldName: string): string => {
  // Take the last segment (e.g. 'nested.shortName' -> 'shortName')
  const leaf = fieldName.includes('.') ? fieldName.split('.').pop()! : fieldName;
  // Convert camelCase to snake_case (e.g. 'shortName' -> 'short_name')
  const key = leaf.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  const translated = t(`c:${key}`);
  // If i18next returns the key itself, fall back to the raw field name
  return translated !== key && translated !== `c:${key}` ? translated : fieldName;
};

// Resolves a user-friendly error message from a validation type.
const resolveErrorMessage = (type?: string, message?: ValidateResult): string => {
  const fallback = typeof message === 'string' ? message : 'Unknown';
  return type ? t(`error:form.${type}`, fallback) : fallback;
};
