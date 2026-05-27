// Per-recipient base: every recipient must have email + preferred language
export type EmailRecipient = { email: string; lng: string };

/**
 * Email template definition (runtime contract used by the mailer).
 *
 * @template TStatic     - Props shared across all recipients (e.g. senderName, entityName)
 * @template TRecipient  - Per-recipient props (must extend EmailRecipient)
 */
export interface EmailTemplateDef<TStatic = Record<string, never>, TRecipient extends EmailRecipient = EmailRecipient> {
  /** Pre-compute all translated strings (+ pass-through statics the component needs). Must include `subject`. */
  translate(lng: string, statics: TStatic): { subject: string } & Record<string, unknown>;
  /** Dumb React shell — receives translate() output + per-recipient display props. No i18n calls. */
  component(props: Record<string, unknown>): React.ReactElement;
  /** Phantom field to carry recipient type — not set at runtime */
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
 * });
 * ```
 */
export function defineEmailTemplate<TStatic, TRecipient extends EmailRecipient = EmailRecipient>() {
  return <TTranslated extends { subject: string }>(def: {
    translate(lng: string, statics: TStatic): TTranslated;
    component(
      props: TTranslated & { [K in Exclude<keyof TRecipient, keyof EmailRecipient>]: string },
    ): React.ReactElement;
  }): EmailTemplateDef<TStatic, TRecipient> => {
    return def as EmailTemplateDef<TStatic, TRecipient>;
  };
}
