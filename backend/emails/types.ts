import type { SafeHtmlPolicy } from './components/safe-html';

/** Per-recipient base fields shared by every email recipient. */
export type EmailRecipient = { email: string; lng: string };

/** Keys of the per-recipient props a component reads, beyond the base fields. */
export type RecipientKey<TRecipient extends EmailRecipient> = Exclude<keyof TRecipient, keyof EmailRecipient>;

/**
 * Per-recipient display props a component reads. The mailer turns these values
 * into Brevo `{{params.x}}` placeholders at send time.
 */
export type RecipientProps<TRecipient extends EmailRecipient> = {
  [K in RecipientKey<TRecipient>]: string;
};

/**
 * Per-recipient values that are HTML the app built itself, every user-derived fragment escaped, keyed to the
 * `SafeHtml` policy the mailer sanitizes them with. Brevo prints these as they are; every other param it escapes.
 */
export type HtmlParams<TRecipient extends EmailRecipient = EmailRecipient> = Partial<
  Record<RecipientKey<TRecipient>, SafeHtmlPolicy>
>;

/**
 * The Brevo placeholder for a per-recipient value: `{{params.<key>}}`, which Brevo fills HTML-escaped, or
 * `{{params.<key>|safe}}` for a declared HTML param.
 * @param key - The per-recipient prop.
 * @param htmlParams - The template's declared HTML params.
 */
export const brevoPlaceholder = (key: string, htmlParams: Partial<Record<string, SafeHtmlPolicy>> = {}) =>
  htmlParams[key] ? `{{params.${key}|safe}}` : `{{params.${key}}}`;

/** Sample render data, co-located with the template so it stays type-checked against its props. */
export interface EmailPreviewData<TStatic, TRecipient extends EmailRecipient = EmailRecipient> {
  /** Props shared across all recipients (passed to `translate`). */
  statics: TStatic;
  /** Per-recipient display props the component reads. */
  recipient: RecipientProps<TRecipient>;
}

/**
 * The mailer's runtime contract. `TStatic`: props shared across recipients (senderName,
 * entityName); `TRecipient` extends `EmailRecipient` with per-recipient props.
 */
export interface EmailTemplateDef<TStatic = Record<string, never>, TRecipient extends EmailRecipient = EmailRecipient> {
  /** Pre-compute all translated strings (+ pass-through statics the component needs). Must include `subject`. */
  translate(lng: string, statics: TStatic): { subject: string } & Record<string, unknown>;
  /** React shell receiving translate() output and per-recipient display props. No i18n calls. */
  component(props: Record<string, unknown>): React.ReactElement;
  /** Sample data to render this template in previews and tests. */
  preview: EmailPreviewData<TStatic, TRecipient>;
  htmlParams?: HtmlParams<TRecipient>;
  /** Phantom field carrying the recipient type; not set at runtime. */
  _recipientType?: TRecipient;
}

/** The curried calls bind the static and recipient types before TS infers the translated shape. */
export function defineEmailTemplate<TStatic, TRecipient extends EmailRecipient = EmailRecipient>() {
  return <TTranslated extends { subject: string }>(def: {
    translate(lng: string, statics: TStatic): TTranslated;
    component(props: TTranslated & RecipientProps<TRecipient>): React.ReactElement;
    preview: EmailPreviewData<TStatic, TRecipient>;
    htmlParams?: HtmlParams<TRecipient>;
  }): EmailTemplateDef<TStatic, TRecipient> => {
    return def as EmailTemplateDef<TStatic, TRecipient>;
  };
}
