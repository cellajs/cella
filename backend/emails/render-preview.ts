import { type EmailPreviewFixture, type EmailPreviewName, emailPreviewFixtures } from './preview-fixtures';
import { render } from './renderer/render';

export interface RenderEmailPreviewOptions {
  lng: string;
  /**
   * When true, render per-recipient props as Brevo `{{params.x}}` placeholders,
   * exactly as the mailer does at send time. When false (default), render with
   * realistic sample values for readability.
   */
  placeholders?: boolean;
}

/**
 * Goes through the real render pipeline (`emails/jsx-email`), so preview output
 * matches what the mailer actually sends. Shared by the dev preview route and tests.
 */
export async function renderEmailPreview(
  name: EmailPreviewName,
  { lng, placeholders = false }: RenderEmailPreviewOptions,
) {
  // Cast to the loose fixture type: the registry preserves each template's
  // specific generic params, which would otherwise collapse `translate`'s
  // parameter to `never` across the union.
  const fixture = emailPreviewFixtures[name] as EmailPreviewFixture | undefined;
  if (!fixture) throw new Error(`Unknown email preview: ${name}`);

  const translated = fixture.def.translate(lng, fixture.statics);
  const { subject, ...componentProps } = translated;

  const recipientProps = placeholders
    ? Object.fromEntries(Object.keys(fixture.recipient).map((key) => [key, `{{params.${key}}}`]))
    : fixture.recipient;

  const html = await render(fixture.def.component({ ...componentProps, ...recipientProps }));
  return { subject: subject as string, html };
}
