import { type EmailPreviewFixture, type EmailPreviewName, emailPreviewFixtures } from './preview-fixtures';
import { render } from './renderer/render';

export interface RenderEmailPreviewOptions {
  lng: string;
  /** True renders per-recipient props as Brevo `{{params.x}}` placeholders, as the mailer does. Default false. */
  placeholders?: boolean;
}

/** Uses the real render pipeline, so preview output matches what the mailer sends. */
export async function renderEmailPreview(
  name: EmailPreviewName,
  { lng, placeholders = false }: RenderEmailPreviewOptions,
) {
  // The cast to the loose fixture type stops `translate`'s parameter collapsing to `never`.
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
