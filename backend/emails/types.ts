import type { SafeHtmlPolicy } from './components/safe-html';
import type { EmailFrame } from './frame';

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
export type HtmlParams<TRecipient extends EmailRecipient = EmailRecipient> = Partial<Record<RecipientKey<TRecipient>, SafeHtmlPolicy>>;

/**
 * The Brevo placeholder for a per-recipient value: `{{params.<key>}}`, which Brevo fills HTML-escaped, or
 * `{{params.<key>|safe}}` for a declared HTML param.
 * @param key - The per-recipient prop.
 * @param htmlParams - The template's declared HTML params.
 */
export const brevoPlaceholder = (key: string, htmlParams: Partial<Record<string, SafeHtmlPolicy>> = {}) =>
  htmlParams[key] ? `{{params.${key}|safe}}` : `{{params.${key}}}`;

/**
 * The placeholder of a per-recipient value (or the recipient's `email`) for text `translate` writes. The mailer passes
 * one that names the send's param keys, which carry a nonce; never write `{{params.<key>}}` by hand.
 */
export type ParamPlaceholder<TRecipient extends EmailRecipient = EmailRecipient> = (key: RecipientKey<TRecipient> | 'email') => string;

/** The placeholder outside a send (previews, tests): `{{params.<key>}}`. */
export const plainParam = (key: string): string => brevoPlaceholder(key);

/** Sample render data, co-located with the template so it stays type-checked against its props. */
export interface EmailPreviewData<TStatic, TRecipient extends EmailRecipient = EmailRecipient> {
  /** Props shared across all recipients (passed to `translate`). */
  statics: TStatic;
  /** Per-recipient display props the component reads. */
  recipient: RecipientProps<TRecipient>;
}

/**
 * Whether a send inside a request ends the body with the request details (country, browser, time). Only mail that reports
 * something done as the recipient (their address, session or link) and operator mail declare it; a function answers per
 * send, for a template whose types differ.
 */
export type RequestDetailsDeclaration<TStatic> = true | ((statics: TStatic) => boolean);

/** Props every component receives from the mailer besides `translate`'s output: the frame it forwards to the layout. */
export type FrameProps = { frame: EmailFrame };

/**
 * The mailer's runtime contract. `TStatic`: props shared across recipients (senderName,
 * entityName); `TRecipient` extends `EmailRecipient` with per-recipient props.
 */
export interface EmailTemplateDef<TStatic = Record<string, never>, TRecipient extends EmailRecipient = EmailRecipient> {
  /**
   * Pre-compute all translated strings (+ pass-through statics the component needs). Must include `subject`. Text that
   * names a per-recipient value gets its placeholder from `param`.
   */
  translate(lng: string, statics: TStatic, param?: ParamPlaceholder<TRecipient>): { subject: string } & Record<string, unknown>;
  /** React shell receiving translate() output and per-recipient display props. No i18n calls. */
  component(props: Record<string, unknown> & FrameProps): React.ReactElement;
  /** Sample data to render this template in previews and tests. */
  preview: EmailPreviewData<TStatic, TRecipient>;
  htmlParams?: HtmlParams<TRecipient>;
  requestDetails?: RequestDetailsDeclaration<TStatic>;
  /** Phantom field carrying the recipient type; not set at runtime. */
  _recipientType?: TRecipient;
}

/** The curried calls bind the static and recipient types before TS infers the translated shape. */
export function defineEmailTemplate<TStatic, TRecipient extends EmailRecipient = EmailRecipient>() {
  return <TTranslated extends { subject: string }>(def: {
    translate(lng: string, statics: TStatic, param?: ParamPlaceholder<TRecipient>): TTranslated;
    component(props: TTranslated & RecipientProps<TRecipient> & FrameProps): React.ReactElement;
    preview: EmailPreviewData<TStatic, TRecipient>;
    htmlParams?: HtmlParams<TRecipient>;
    requestDetails?: RequestDetailsDeclaration<TStatic>;
  }): EmailTemplateDef<TStatic, TRecipient> => {
    return def as EmailTemplateDef<TStatic, TRecipient>;
  };
}
