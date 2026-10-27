import { emailFrame } from './frame';
import { type EmailPreviewName, emailPreviews, previewRecipientEmail, previewRequestDetails } from './preview-fixtures';
import { render } from './renderer/render';
import { brevoPlaceholder } from './types';

export interface RenderEmailPreviewOptions {
  lng: string;
  /** True renders per-recipient props as the Brevo placeholders the mailer uses (`brevoPlaceholder`). Default false. */
  placeholders?: boolean;
}

/** Uses the real render pipeline, so preview output matches what the mailer sends. */
export async function renderEmailPreview(name: EmailPreviewName, { lng, placeholders = false }: RenderEmailPreviewOptions) {
  const def = emailPreviews[name];
  const { subject, ...componentProps } = def.translate(lng, def.preview.statics);

  const recipientProps = placeholders
    ? Object.fromEntries(Object.keys(def.preview.recipient).map((key) => [key, brevoPlaceholder(key, { ...def.htmlParams })]))
    : def.preview.recipient;

  // The footer's address: a sample, or the placeholder the mailer would leave.
  const param = (key: string) => (key === 'email' && !placeholders ? previewRecipientEmail : brevoPlaceholder(key));
  const frame = emailFrame(def, def.preview.statics, lng, previewRequestDetails, param);
  const html = await render(def.component({ ...componentProps, ...recipientProps, frame }));
  return { subject, html };
}
