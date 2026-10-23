export type DocsSearchResultType = 'page' | 'heading' | 'text' | 'operation' | 'schema';

export type DocsSearchResult = {
  id: string;
  /** Group key: child rows (heading/text) directly follow their page row. */
  pageId: string;
  type: DocsSearchResultType;
  /** Row text: a title, or for body text a window around the first match. */
  title: string;
  /** Ancestor labels for context (page ancestors, or the operation's tag). */
  breadcrumbs: string[];
  to: string;
  params?: { _splat: string };
  /** Bare section id (scroll-spy convention: no `spy-` DOM prefix). */
  hash?: string;
  method?: string;
  deprecated?: boolean;
};

/** Scope chip filter: everything, docs pages only, or API reference only. */
export type DocsSearchScope = 'all' | 'pages' | 'api';

/** The engine behind the docs dialog, which renders `DocsSearchResult` rows without knowing it, so the engine can be swapped. */
export type DocsSearchClient = {
  /** Returns a flat, pre-ordered list: page row first, then its child rows. */
  search: (term: string, scope?: DocsSearchScope) => Promise<DocsSearchResult[]>;
};
