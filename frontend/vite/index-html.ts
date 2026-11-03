import type { Plugin } from 'vite';

/** The escaping EJS applies to `<%= %>` output. */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' })[char] ?? char);

/** Vite plugin for index.html: the `<%= key %>` placeholders filled from `data`. */
export const indexHtml = (data: Record<string, string>): Plugin => ({
  name: 'index-html',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace(/<%=\s*(\w+)\s*%>/g, (placeholder, key: string) => (key in data ? escapeHtml(data[key]) : placeholder)),
  },
});
