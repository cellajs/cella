import type { Plugin } from 'vite';

/** The escaping EJS applies to `<%= %>` output. */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' })[char] ?? char);

/**
 * Vite plugins for index.html: the `<%= key %>` placeholders filled from `data`, and in a build, once Vite has added
 * its script and stylesheet tags, the comments and the whitespace between tags dropped.
 */
export const indexHtml = (data: Record<string, string>): Plugin[] => [
  {
    name: 'index-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/<%=\s*(\w+)\s*%>/g, (placeholder, key: string) => (key in data ? escapeHtml(data[key]) : placeholder)),
    },
  },
  {
    name: 'index-html-minify',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => {
        let sanitized = html;
        let previous: string;
        do {
          previous = sanitized;
          sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');
        } while (sanitized !== previous);

        return sanitized
          .replace(/>\s+</g, '><')
          .replace(/>\s+([^<>]*?)\s+</g, '>$1<')
          .replace(/\s+\/>/g, '/>')
          .trim();
      },
    },
  },
];
