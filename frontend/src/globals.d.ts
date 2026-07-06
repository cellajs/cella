/** Build-time defines injected by vite.config.ts. */

/** Release identifier (git SHA, or 'unknown') — used as Maple serviceVersion. */
declare const __APP_VERSION__: string;

/** Build-time frontmatter + headings index of docs pages (vite/docs-frontmatter.ts). */
declare module 'virtual:docs-frontmatter' {
  const docsIndex: Record<string, { frontmatter: unknown; headings: { id: string; text: string; depth: number }[] }>;
  export default docsIndex;
}
