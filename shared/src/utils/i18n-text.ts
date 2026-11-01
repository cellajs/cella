import { appConfig } from '../config-builder/app-config.ts';

/** Values every translation may interpolate without its call site passing them: `{{appName}}`, `{{company}}`. */
export const i18nDefaultVariables = { appName: appConfig.name, company: appConfig.company.name };

/**
 * A label as it reads inside a sentence: the first letter lowercased, an acronym kept ("API key", "MFA"). Translations
 * call it as `{{resource, lowercase}}`, so each language decides whether a noun lowercases mid-sentence; callers pass
 * the label form, `t('c:organization')`.
 */
export const lowercaseLabel = (value: unknown, lng?: string) => {
  const text = String(value);
  return /^\p{Lu}{2}/u.test(text) ? text : `${text.charAt(0).toLocaleLowerCase(lng)}${text.slice(1)}`;
};

/** Registers the template's formatters on an initialized i18next instance. */
export const addI18nFormatters = (formatter?: { add: (name: string, format: (value: unknown, lng?: string) => string) => void }) =>
  formatter?.add('lowercase', lowercaseLabel);
