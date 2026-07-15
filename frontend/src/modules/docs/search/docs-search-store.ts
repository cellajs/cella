import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addRecentSearch } from '~/utils/recent-searches';

interface DocsSearchStoreState {
  recentSearches: string[];
}

/**
 * Recent docs searches. Persisted to localStorage, not the per-user idb kv store: docs is public
 * and idb no-ops while signed out, which would drop history for anonymous visitors.
 */
export const useDocsSearchStore = create<DocsSearchStoreState>()(
  persist(() => ({ recentSearches: [] as string[] }), {
    name: 'docs-search',
    storage: createJSONStorage(() => localStorage),
  }),
);

export const deleteRecentSearch = (value: string) => {
  useDocsSearchStore.setState((state) => {
    const searches = state.recentSearches.filter((entry) => entry !== value);
    return searches.length === state.recentSearches.length ? state : { recentSearches: searches };
  });
};

/** Record a submitted query: most recent on top, normalized/containment dedupe. */
export const updateRecentSearches = (value: string) => {
  useDocsSearchStore.setState((state) => {
    const searches = addRecentSearch(state.recentSearches, value);
    return searches === state.recentSearches ? state : { recentSearches: searches };
  });
};
