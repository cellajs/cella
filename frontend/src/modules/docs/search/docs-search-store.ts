import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addRecentSearch, withoutRecentSearch } from '~/utils/recent-searches';

interface DocsSearchStoreState {
  recentSearches: string[];
  /** Records a submitted query: most recent first, a value contained in another kept once. */
  saveRecentSearch: (value: string) => void;
  removeRecentSearch: (value: string) => void;
}

/** Recent docs searches, in localStorage: the per-user idb store no-ops while signed out, which would drop an anonymous visitor's history. */
export const useDocsSearchStore = create<DocsSearchStoreState>()(
  persist(
    (set, get) => ({
      recentSearches: [],
      saveRecentSearch: (value) => {
        const recentSearches = addRecentSearch(get().recentSearches, value);
        if (recentSearches !== get().recentSearches) set({ recentSearches });
      },
      removeRecentSearch: (value) => {
        const recentSearches = withoutRecentSearch(get().recentSearches, value);
        if (recentSearches !== get().recentSearches) set({ recentSearches });
      },
    }),
    { name: 'docs-search', storage: createJSONStorage(() => localStorage) },
  ),
);
