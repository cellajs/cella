/** Per-recipient base fields shared by every email recipient. */
export type EmailRecipient = { email: string; lng: string };

/**
 * Per-recipient display props a component reads. The mailer turns these values
 * into Brevo `{{params.x}}` placeholders at send time.
 */
export type RecipientProps<TRecipient extends EmailRecipient> = {
  [K in Exclude<keyof TRecipient, keyof EmailRecipient>]: string;
};

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
  /** Phantom field carrying the recipient type; not set at runtime. */
  _recipientType?: TRecipient;
}

/** The curried calls bind the static and recipient types before TS infers the translated shape. */
export function defineEmailTemplate<TStatic, TRecipient extends EmailRecipient = EmailRecipient>() {
  return <TTranslated extends { subject: string }>(def: {
    translate(lng: string, statics: TStatic): TTranslated;
    component(props: TTranslated & RecipientProps<TRecipient>): React.ReactElement;
    preview: EmailPreviewData<TStatic, TRecipient>;
  }): EmailTemplateDef<TStatic, TRecipient> => {
    return def as EmailTemplateDef<TStatic, TRecipient>;
  };
}
