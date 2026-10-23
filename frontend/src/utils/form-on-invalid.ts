import i18n, { t } from 'i18next';
import { type BaseSyntheticEvent, createElement } from 'react';
import type { FieldError, FieldErrors, FieldValues, ValidateResult } from 'react-hook-form';
import type { TKey } from '~/lib/i18n-locales';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Toasts the errors of a refused submit that no field shows. A field rendered in the submitted form shows its own
 * message under its input and takes focus, so its error is left out, and with every error inline there is no toast.
 * Without the submit event (a programmatic submit) every error is listed.
 */
export const defaultOnInvalid = <TFieldValues extends FieldValues>(errors: FieldErrors<TFieldValues>, event?: BaseSyntheticEvent) => {
  if (Object.keys(errors).length === 0) return;
  console.error('Form validation failed', errors);

  // The target, since React has cleared `currentTarget` by the time an async validation ends
  const form = event && event.target instanceof HTMLFormElement ? event.target : undefined;
  const messages = collectMessages(errors, form);
  if (!messages.length) return;

  const description = createElement(
    'div',
    null,
    messages.map((message, i) => createElement('p', { key: i }, message)),
  );
  toaster.error(t('error:form.invalid_form'), { description });
};

const collectMessages = <TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  form: HTMLFormElement | undefined,
  parentFieldName?: string,
): string[] => {
  const messages: string[] = [];

  for (const [name, value] of Object.entries(errors)) {
    if (!value) continue;

    const fieldName = parentFieldName ? `${parentFieldName}.${name}` : name;
    const label = resolveFieldLabel(fieldName);

    if ('message' in value || 'type' in value || 'types' in value) {
      const error = value as FieldError;
      if (showsInline(form, fieldName)) continue;

      const fieldMessages = error.types ? Object.values(error.types) : [error.message];
      for (const message of fieldMessages) messages.push(`${label}: ${resolveErrorMessage(message)}`);
    } else {
      messages.push(...collectMessages(value as FieldErrors<TFieldValues>, form, fieldName));
    }
  }

  return messages;
};

/** The form renders an input of the field with a box (mounted, not `display: none`), so the field's message shows its error. */
const showsInline = (form: HTMLFormElement | undefined, fieldName: string) =>
  !!form && Array.from(form.querySelectorAll(`[name="${CSS.escape(fieldName)}"]`)).some((input) => input.getClientRects().length > 0);

// Resolve a camelCase field name to a translated label via c:{snake_case} convention
const resolveFieldLabel = (fieldName: string): string => {
  const leaf = fieldName.slice(fieldName.lastIndexOf('.') + 1);
  const key = leaf.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const translated = t(`c:${key}` as TKey);
  // If i18next returns the key itself, fall back to the raw field name
  return translated !== key && translated !== `c:${key}` ? translated : fieldName;
};

/** The message as the field shows it: zod's are already plain words (`formErrorMessage`), a `setError` may pass a translation key. */
const resolveErrorMessage = (message?: ValidateResult): string => {
  if (typeof message !== 'string' || !message) return t('error:form.not_accepted');
  return i18n.exists(message) ? t(message as TKey) : message;
};
