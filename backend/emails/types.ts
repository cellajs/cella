/** Per-recipient base fields shared by every email recipient. */
export type EmailRecipient = { email: string; lng: string };

/**
 * Per-recipient display props a component reads — the values the mailer turns
 * into Brevo `{{params.x}}` placeholders at send time.
 */
export type RecipientProps<TRecipient extends EmailRecipient> = {
  [K in Exclude<keyof TRecipient, keyof EmailRecipient>]: string;
};

/**
 * Sample data to render a template in previews and tests, co-located with the
 * template so it stays type-checked against the template's own props.
 */
export interface EmailPreviewData<TStatic, TRecipient extends EmailRecipient = EmailRecipient> {
  /** Props shared across all recipients (passed to `translate`). */
  statics: TStatic;
  /** Per-recipient display props the component reads. */
  recipient: RecipientProps<TRecipient>;
}

/**
 * Email template definition — the runtime contract the mailer consumes.
 * `TStatic`: props shared across recipients (e.g. senderName, entityName);
 * `TRecipient` extends `EmailRecipient` with per-recipient props.
 */
export interface EmailTemplateDef<TStatic = Record<string, never>, TRecipient extends EmailRecipient = EmailRecipient> {
  /** Pre-compute all translated strings (+ pass-through statics the component needs). Must include `subject`. */
  translate(lng: string, statics: TStatic): { subject: string } & Record<string, unknown>;
  /** React shell receiving translate() output and per-recipient display props. No i18n calls. */
  component(props: Record<string, unknown>): React.ReactElement;
  /** Sample data to render this template in previews and tests. */
  preview: EmailPreviewData<TStatic, TRecipient>;
  /** Phantom field carrying the recipient type; not set at runtime. */
  _recipientType?: TRecipient;
}

/**
 * Type-safe factory for email templates: infers the shape returned by
 * `translate()` and enforces that `component()` receives exactly those props
 * (plus per-recipient placeholder strings), catching props a component
 * destructures that `translate()` never returns.
 *
 * Curried because TypeScript cannot partially infer type params: the first call
 * binds TStatic / TRecipient (caller-specified), the second infers TTranslated
 * from `translate`'s return type.
 *
 * @example
 * ```ts
 * export const fooEmail = defineEmailTemplate<FooStatic, FooRecipient>()({
 *   translate(lng, statics) { return { subject: '…', bar: '…' }; },
 *   component({ bar }) { … },
 *   preview: { statics: { … }, recipient: { … } },
 * });
 * ```
 */
export function defineEmailTemplate<TStatic, TRecipient extends EmailRecipient = EmailRecipient>() {
  return <TTranslated extends { subject: string }>(def: {
    translate(lng: string, statics: TStatic): TTranslated;
    component(props: TTranslated & RecipientProps<TRecipient>): React.ReactElement;
    preview: EmailPreviewData<TStatic, TRecipient>;
  }): EmailTemplateDef<TStatic, TRecipient> => {
    return def as EmailTemplateDef<TStatic, TRecipient>;
  };
}
