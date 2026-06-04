import { Hono } from 'hono';
import { appConfig } from 'shared';
import { emailPreviewFixtures, emailPreviewNames } from './preview-fixtures';
import { renderEmailPreview } from './render-preview';

/**
 * Email preview routes.
 *
 * Renders email templates through the real `emails/jsx-email` pipeline so the
 * output matches what the mailer sends. Mounted only outside production (see
 * `src/routes.ts`) and intended for local authoring and the Storybook email
 * stories, which fetch the rendered HTML through the Storybook Vite proxy.
 *
 * - `GET /`           → index page linking every template × language.
 * - `GET /list`       → JSON `{ names, languages }` (used to generate stories).
 * - `GET /:name`      → rendered HTML for one template.
 *     query: `lng` (default: first configured language),
 *            `placeholders=1` to show Brevo `{{params.x}}` instead of samples.
 */
const app = new Hono();

const isPreviewName = (value: string): value is (typeof emailPreviewNames)[number] =>
  Object.hasOwn(emailPreviewFixtures, value);

app.get('/', (c) => {
  const rows = emailPreviewNames
    .map((name) => {
      const links = appConfig.languages.map((lng) => `<a href="./${name}?lng=${lng}">${lng}</a>`).join(' · ');
      return `<li><strong>${name}</strong> — ${links}</li>`;
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

export const emailPreviewHandlers = app;
