import { emailFrame } from './frame';
import { type EmailPreviewName, emailPreviews, previewData, previewRecipientEmail, previewRequestDetails } from './preview-fixtures';
import { render } from './renderer/render';
import { brevoPlaceholder } from './types';

export interface RenderEmailPreviewOptions {
  lng: string;
  /** One of the template's `previewVariants`; its default `preview` when absent. */
  variant?: string;
  /** True renders per-recipient props as the Brevo placeholders the mailer uses (`brevoPlaceholder`). Default false. */
  placeholders?: boolean;
}

/**
 * Uses the real render pipeline, so preview output matches what the mailer sends.
 * @throws Error for a variant the template does not declare.
 */
export async function renderEmailPreview(name: EmailPreviewName, { lng, variant, placeholders = false }: RenderEmailPreviewOptions) {
  const def = emailPreviews[name];
  const data = previewData(name, variant);
  if (!data) throw new Error(`Unknown preview variant of ${name}: ${variant}`);

  const htmlParams = { ...def.htmlParams };
  // A per-recipient value in text `translate` writes and in the footer: the placeholder the mailer would leave, or the
  // value Brevo would fill in, the sample address for `email`.
  const param = (key: string) => {
    if (placeholders) return brevoPlaceholder(key, htmlParams);
    return key === 'email' ? previewRecipientEmail : (data.recipient[key] ?? brevoPlaceholder(key, htmlParams));
  };
  const { subject, ...componentProps } = def.translate(lng, data.statics, (key) => param(String(key)));

  const recipientProps = placeholders
    ? Object.fromEntries(Object.keys(data.recipient).map((key) => [key, brevoPlaceholder(key, htmlParams)]))
    : data.recipient;

  const frame = emailFrame(def, data.statics, lng, previewRequestDetails, param);
  const html = await render(def.component({ ...componentProps, ...recipientProps, frame }));
  return { subject, html };
}
