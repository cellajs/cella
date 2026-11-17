import { html, raw } from 'hono/html';
import { appConfig } from 'shared';
import type { LinkPreview } from '#/lib/module';

/** The page a share link answers with: Open Graph tags for a chat's unfurl, and a script that sends a browser on into the app. */
export const linkPreviewPage = ({ title, ogTitle, description, redirectUrl, image = '/thumbnail.jpg', indexable }: LinkPreview) => html`
  <!DOCTYPE html>
  <html lang="${appConfig.defaultLanguageCode}">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>

      <meta property="og:title" content="${ogTitle}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:image" content="${appConfig.frontendUrl}${image}" />
      <meta property="og:url" content="${raw(redirectUrl)}" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="${appConfig.name}" />
      <meta property="og:locale" content="en_US" />

      <meta name="robots" content="${indexable ? 'index,follow' : 'noindex,nofollow'}" />
    </head>

    <script>
      ${raw(`window.location.href = "${redirectUrl}";`)}
    </script>
  </html>
`;
