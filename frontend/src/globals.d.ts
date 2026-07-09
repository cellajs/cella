/** Release identifier (git SHA, or 'unknown') used as Maple serviceVersion. */
declare const __APP_VERSION__: string;

/** Build-time frontmatter + headings index of docs pages (vite/docs-frontmatter.ts). */
declare module 'virtual:docs-frontmatter' {
  export const docsIndex: Record<
    string,
    { frontmatter: unknown; headings: { id: string; text: string; depth: number }[] }
  >;
}

/**
 * Build-time search corpus: plaintext body paragraphs per docs page, anchored to
 * their nearest heading by bare anchor id (vite/docs-frontmatter.ts). Only the
 * lazy docs search engine imports this.
 */
declare module 'virtual:docs-search-sections' {
  export const docsSectionsIndex: Record<string, { headingId: string | null; text: string }[]>;
}
