import { Hono } from 'hono';
import { appConfig } from 'shared';
import { type EmailPreviewName, emailPreviewNames, emailPreviews } from './preview-fixtures';
import { renderEmailPreview } from './render-preview';

const app = new Hono();

const isPreviewName = (value: string): value is EmailPreviewName => Object.hasOwn(emailPreviews, value);

app.get('/', (c) => {
  // Served without a trailing slash, `./<name>` would resolve beside this page; the last segment keeps links inside it.
  const base = c.req.path.endsWith('/') ? './' : `./${c.req.path.split('/').pop()}/`;
  const rows = emailPreviewNames
    .map((name) => {
      const links = appConfig.languages.map((lng) => `<a href="${base}${name}?lng=${lng}">${lng}</a>`).join(' · ');
      return `<li><strong>${name}</strong>: ${links}</li>`;
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

app.get('/list', (c) => c.json({ names: emailPreviewNames, languages: appConfig.languages }));

app.get('/:name', async (c) => {
  const name = c.req.param('name');
  if (!isPreviewName(name)) return c.text(`Unknown email preview: ${name}`, 404);

  const lng = c.req.query('lng') || appConfig.languages[0];
  const placeholders = c.req.query('placeholders') === '1';

  const { html } = await renderEmailPreview(name, { lng, placeholders });
  return c.html(html);
});

/** Email preview routes for local authoring and Storybook template rendering. */
export const emailPreviewHandlers = app;
