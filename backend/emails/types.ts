/** Per-recipient base fields shared by every email recipient. */
export type EmailRecipient = { email: string; lng: string };

/**
 * Per-recipient display props a component reads (the values the mailer turns
 * into Brevo `{{params.x}}` placeholders at send time). Derived from the
 * recipient type minus the always-present `EmailRecipient` base fields.
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
 * Email template definition (runtime contract used by the mailer).
 *
 * @template TStatic     - Props shared across all recipients (e.g. senderName, entityName)
 * @template TRecipient  - Per-recipient props (must extend EmailRecipient)
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
 * Type-safe factory for email templates.
 *
 * Infers the shape returned by `translate()` and enforces that `component()`
 * receives exactly those props (plus any per-recipient placeholder strings).
 * This prevents mismatches where a component destructures a prop that
 * `translate()` never returns.
 *
 * Uses a curried call because TypeScript cannot partially infer type params:
 * the first call binds TStatic / TRecipient (caller-specified), while the
 * second call lets TS infer TTranslated from the `translate` return type.
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
