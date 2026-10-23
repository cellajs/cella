import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addRecentSearch, withoutRecentSearch } from '~/utils/recent-searches';

interface DocsSearchStoreState {
  recentSearches: string[];
}

/** Recent docs searches, in localStorage: the per-user idb store no-ops while signed out, which would drop an anonymous visitor's history. */
export const useDocsSearchStore = create<DocsSearchStoreState>()(
  persist<DocsSearchStoreState>(() => ({ recentSearches: [] }), { name: 'docs-search', storage: createJSONStorage(() => localStorage) }),
);

export const removeRecentSearch = (value: string) => {
  useDocsSearchStore.setState((state) => {
    const searches = withoutRecentSearch(state.recentSearches, value);
    return searches === state.recentSearches ? state : { recentSearches: searches };
  });
};

/** Record a submitted query: most recent on top, normalized/containment dedupe. */
export const saveRecentSearch = (value: string) => {
  useDocsSearchStore.setState((state) => {
    const searches = addRecentSearch(state.recentSearches, value);
    return searches === state.recentSearches ? state : { recentSearches: searches };
  });
};

export { useDocsSearchStore as docsSearchStore };
