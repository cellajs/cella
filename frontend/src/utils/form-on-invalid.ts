import { t } from 'i18next';
import { type BaseSyntheticEvent, createElement } from 'react';
import type { FieldError, FieldErrors, FieldValues, ValidateResult } from 'react-hook-form';
import type { TKey } from '~/lib/i18n-locales';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Toasts a refused submit. The toast lists the errors no field shows: a field rendered in the submitted form shows its
 * own message under its input, so its error is left out, and with every error inline the toast is the headline alone.
 * Without the submit event (a programmatic submit) every error is listed.
 */
export const defaultOnInvalid = <TFieldValues extends FieldValues>(errors: FieldErrors<TFieldValues>, event?: BaseSyntheticEvent) => {
  if (Object.keys(errors).length === 0) return;

  // The target, since React has cleared `currentTarget` by the time an async validation ends
  const form = event && event.target instanceof HTMLFormElement ? event.target : undefined;
  const messages = processErrors(errors, form);
  const description = messages.length
    ? createElement(
        'div',
        null,
        messages.map((msg, i) => createElement('p', { key: i }, msg)),
      )
    : undefined;
  toaster.error(t('error:form.invalid_form'), { description });

  console.error('Form validation failed', errors);
};

const processErrors = <TFieldValues extends FieldValues>(
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
      messages.push(...processErrors(value as FieldErrors<TFieldValues>, form, fieldName));
    }
  }

  return messages;
};

/** The form renders an input of the field with a box (mounted, not `display: none`), so the field's message shows its error. */
const showsInline = (form: HTMLFormElement | undefined, fieldName: string) =>
  !!form && Array.from(form.querySelectorAll(`[name="${CSS.escape(fieldName)}"]`)).some((input) => input.getClientRects().length > 0);

// Resolve a camelCase field name to a translated label via c:{snake_case} convention
const resolveFieldLabel = (fieldName: string): string => {
  const leaf = fieldName.includes('.') ? fieldName.split('.').pop()! : fieldName;
  const key = leaf.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
  const translated = t(`c:${key}` as TKey);
  // If i18next returns the key itself, fall back to the raw field name
  return translated !== key && translated !== `c:${key}` ? translated : fieldName;
};

/** Rule types whose author writes the message (a zod refinement, a `validate` rule): shown as written. */
const authoredRuleTypes = ['custom', 'validate'];

const resolveErrorMessage = (type?: string, message?: ValidateResult): string => {
  const own = typeof message === 'string' && message ? message : undefined;
  if (own && (!type || authoredRuleTypes.includes(type))) return own;
  return type ? t(`error:form.${type}`, own ?? 'Unknown') : 'Unknown';
};
