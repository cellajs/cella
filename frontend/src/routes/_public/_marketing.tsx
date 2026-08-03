import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';

/**
 * Layout for all marketing routes. Preloads the lazily-fetched translation namespaces its
 * pages render (`about` for the sync-engine/about diagrams, `c` for the text-only pages) before
 * paint, so non-bundled languages (e.g. `nl`) don't flash untranslated content and reflow.
 */
export const Route = createFileRoute('/_public/_marketing')({
  staticData: { isAuth: false },
  loader: () => i18n.loadNamespaces(['about', 'c']),
});
