import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const MAX_RECENT_SEARCHES = 5;

interface DocsSearchStoreState {
  recentSearches: string[];
}

/**
 * Recent docs searches. Persisted to localStorage rather than the per-user
 * idb kv store: docs is a public surface and the idb storage no-ops while
 * signed out, which would drop history for anonymous visitors.
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

/** Record a submitted query; skips short values and near-duplicates (AppSearch rules). */
export const updateRecentSearches = (value: string) => {
  if (!value) return;
  if (value.replaceAll(' ', '').length < 3) return;
  useDocsSearchStore.setState((state) => {
    const hasSubstringMatch = state.recentSearches.some((entry) => entry.toLowerCase().includes(value.toLowerCase()));
    if (hasSubstringMatch) return state;
    const searches = [...state.recentSearches, value];
    if (searches.length > MAX_RECENT_SEARCHES) searches.shift();
    return { recentSearches: searches };
  });
};
