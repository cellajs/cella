import { Hono } from 'hono';
import { appConfig } from 'shared';
import { renderChatText } from './chat-text';
import { type EmailPreviewName, emailPreviewList, emailPreviews, previewData, previewPath, previewRequestDetails } from './preview-fixtures';
import { renderEmailPreview } from './render-preview';
import { escapeString } from './renderer/escape-string';

const app = new Hono();

const isPreviewName = (value: string): value is EmailPreviewName => Object.hasOwn(emailPreviews, value);

app.get('/', (c) => {
  // Served without a trailing slash, `./<name>` would resolve beside this page; the last segment keeps links inside it.
  const base = c.req.path.endsWith('/') ? './' : `./${c.req.path.split('/').pop()}/`;
  const rows = emailPreviewList
    .map(({ name, variant }) => {
      const query = variant ? `&variant=${variant}` : '';
      const links = (path: string) => appConfig.languageCodes.map((lng) => `<a href="${base}${path}?lng=${lng}${query}">${lng}</a>`).join(' · ');
      const chat = emailPreviews[name].chat ? ` · chat: ${links(`${name}/chat`)}` : '';
      return `<li><strong>${previewPath({ name, variant })}</strong>: ${links(name)}${chat}</li>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Email previews</title>
    <style>
      body { font: 14px system-ui, sans-serif; margin: 2rem; }
      li { margin: 0.4rem 0; }
      a { margin-right: 0.2rem; }
    </style>
  </head>
  <body>
    <h1>Email previews</h1>
    <ul>${rows}</ul>
  </body>
</html>`;

  return c.html(html);
});

app.get('/list', (c) => c.json({ names: emailPreviewList.map(previewPath), languages: appConfig.languageCodes }));

app.get('/:name', async (c) => {
  const name = c.req.param('name');
  if (!isPreviewName(name)) return c.text(`Unknown email preview: ${name}`, 404);

  const variant = c.req.query('variant') || undefined;
  if (!previewData(name, variant)) return c.text(`Unknown variant of email preview ${name}: ${variant}`, 404);

  const lng = c.req.query('lng') || appConfig.languageCodes[0];
  const placeholders = c.req.query('placeholders') === '1';

  const { html } = await renderEmailPreview(name, { lng, variant, placeholders });
  return c.html(html);
});

app.get('/:name/chat', (c) => {
  const name = c.req.param('name');
  if (!isPreviewName(name)) return c.text(`Unknown email preview: ${name}`, 404);

  const def = emailPreviews[name];
  if (!def.chat) return c.text(`No chat text for email preview ${name}`, 404);

  const variant = c.req.query('variant') || undefined;
  const data = previewData(name, variant);
  if (!data) return c.text(`Unknown variant of email preview ${name}: ${variant}`, 404);

  const lng = c.req.query('lng') || appConfig.languageCodes[0];
  const { body, formatted_body } = renderChatText(def.chat(lng, data.statics, previewRequestDetails));

  // The formatted body is built and escaped by `renderChatText`, as a Matrix client receives it.
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Chat text: ${name}</title>
    <style>
      body { font: 14px system-ui, sans-serif; margin: 2rem; max-width: 40rem; }
      .message { border: 1px solid #ccc; border-radius: 6px; padding: 0 1rem; }
      small { color: #666; }
      pre { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>${previewPath({ name, variant })}</h1>
    <div class="message">${formatted_body}</div>
    <p><small>Plain text and phone notification</small></p>
    <pre>${escapeString(body)}</pre>
  </body>
</html>`;

  return c.html(html);
});

/** Email preview routes for local authoring and Storybook template rendering. */
export const emailPreviewHandlers = app;
