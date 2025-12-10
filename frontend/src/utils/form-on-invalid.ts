import * as ErrorTracker from '@sentry/react';
import { t } from 'i18next';
import { createElement } from 'react';
import type { FieldError, FieldErrors, FieldValues, ValidateResult } from 'react-hook-form';
import { toaster } from '~/modules/common/toaster/service';

/**
 * Handles invalid form submissions. Extracting and displaying error messages, and reporting them to Sentry.
 */
export const defaultOnInvalid = <TFieldValues extends FieldValues>(errors: FieldErrors<TFieldValues>) => {
  const messages = processErrors(errors);

  if (messages.length === 0) return;

  // Display a toaster with a list of validation errors
  toaster('Form field errors', 'error', {
    description: createElement(
      'div',
      null,
      messages.map((msg, i) => createElement('p', { key: i }, msg)),
    ),
  });

  ErrorTracker.captureException(new Error('Form validation failed'), { extra: errors });
};

// Recursively build a list of readable error message from FieldErrors object
const processErrors = <TFieldValues extends FieldValues>(errors: FieldErrors<TFieldValues>, parentFieldName?: string): string[] => {
  const messages: string[] = [];

  for (const [name, value] of Object.entries(errors)) {
    if (!value) continue;

    const fieldName = parentFieldName ? `${parentFieldName}.${name}` : name;

    // Leaf node error with 'type', 'message', or 'types'
    if ('message' in value || 'type' in value || 'types' in value) {
      const error = value as FieldError;

      // Multiple error types
      if (error.types) {
        for (const [subType, subMsg] of Object.entries(error.types)) {
          const message = resolveErrorMessage(subType, subMsg);
          messages.push(`${fieldName}: ${message}`);
        }
      } else {
        const message = resolveErrorMessage(error.type, error.message);
        messages.push(`${fieldName}: ${message}`);
      }
    } else {
      // Nested field group (e.g. field arrays or nested objects)
      messages.push(...processErrors(value as FieldErrors<TFieldValues>, fieldName));
    }
  }

  return messages;
};

// Resolves a user-friendly error message from a validation type.
const resolveErrorMessage = (type?: string, message?: ValidateResult): string => {
  const fallback = typeof message === 'string' ? message : 'Unknown';
  return type ? t(`error:form.${type}`, fallback) : fallback;
};
