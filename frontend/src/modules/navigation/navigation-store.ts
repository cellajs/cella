import { isRecord } from 'shared/utils/as-record';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { NavItemId, RecentSelection } from '~/modules/navigation/types';
import { idbKvStorage } from '~/query/idb-kv-storage';
import { addRecentSearch, withoutRecentSearch } from '~/utils/recent-searches';

interface NavigationStoreState {
  recentSearches: string[]; // Search values entered in AppSearch
  /** Records a search that opened a result: most recent first, a value contained in another kept once. */
  saveRecentSearch: (value: string) => void;
  removeRecentSearch: (value: string) => void;

  recentSelections: RecentSelection[]; // Most recent first
  /** Puts the entry first and drops the ones `isAvailable` rejects, so an entry that can no longer open holds no place. */
  saveRecentSelection: (entry: RecentSelection, isAvailable: (entry: RecentSelection) => boolean) => void;
  removeRecentSelection: (id: string) => void;

  searchCollapsedTypes: Record<string, boolean>; // Per entity type, whether its AppSearch groups are collapsed, recent and results alike
  toggleSearchCollapsed: (entityType: string) => void;

  navSheetOpen: NavItemId | null;
  navSheetOrganizationId: string | null; // Organization the menu sheet holds alone; null while it lists every channel
  /** Opening with an `organizationId` also makes it the `lastOrganizationId`. Closing keeps the organization, so the sheet leaves as it was. */
  setNavSheetOpen: (navSheetOpen: NavItemId | null, organizationId?: string | null) => void;

  lastOrganizationId: string | null; // Organization the menu sheet last held alone, where the mobile menu opens outside organization pages

  lastChannelIds: Record<string, string>; // Per organization id, the channel below it that its pages last showed, where its rail button lands
  setLastChannelId: (organizationId: string, channelId: string) => void;

  keepNavOpen: boolean; // Nav sheet stays open beside the content
  setKeepNavOpen: (keepNavOpen: boolean) => void;

  keepOpenPreference: boolean; // User preference behind keepNavOpen
  setKeepOpenPreference: (keepOpenPreference: boolean) => void;

  detailedMenu: boolean; // Menu sheet shows submenus
  setDetailedMenu: (detailedMenu: boolean) => void;

  activeSections: Record<string, boolean> | null; // Expanded state per section the user toggled, including archived ones
  setSectionOpen: (sectionKey: string, open: boolean) => void;
  resetSections: () => void;

  navSheetPanel: string | null; // Open bottom panel of a nav sheet; at most one
  toggleNavSheetPanel: (panel: string) => void;

  floatingNavActive: boolean; // Floating nav is visible, which hides the bottom bar
  setFloatingNavActive: (floatingNavActive: boolean) => void;

  reset: () => void; // Called on sign-out
}

interface InitStore
  extends Pick<
    NavigationStoreState,
    | 'recentSearches'
    | 'recentSelections'
    | 'searchCollapsedTypes'
    | 'keepNavOpen'
    | 'detailedMenu'
    | 'activeSections'
    | 'navSheetOpen'
    | 'navSheetOrganizationId'
    | 'lastOrganizationId'
    | 'lastChannelIds'
    | 'keepOpenPreference'
    | 'floatingNavActive'
    | 'navSheetPanel'
  > {}

const maxRecentSelections = 6;

const initStore: InitStore = {
  recentSearches: [],
  recentSelections: [],
  searchCollapsedTypes: {},
  navSheetOpen: null,
  navSheetOrganizationId: null,
  lastOrganizationId: null,
  lastChannelIds: {},
  keepNavOpen: false, // Managed reactively by app-nav effect
  keepOpenPreference: false,
  detailedMenu: false,
  floatingNavActive: false,
  activeSections: null,
  navSheetPanel: null,
};

export const useNavigationStore = create<NavigationStoreState>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          ...initStore,
          saveRecentSearch: (value) => {
            const recentSearches = addRecentSearch(get().recentSearches, value);
            // An unchanged list would still write the persisted store
            if (recentSearches === get().recentSearches) return;
            set((state) => {
              state.recentSearches = recentSearches;
            });
          },
          removeRecentSearch: (value) => {
            const recentSearches = withoutRecentSearch(get().recentSearches, value);
            if (recentSearches === get().recentSearches) return;
            set((state) => {
              state.recentSearches = recentSearches;
            });
          },
          saveRecentSelection: (entry, isAvailable) => {
            const rest = get().recentSelections.filter((other) => other.id !== entry.id && isAvailable(other));
            set((state) => {
              state.recentSelections = [entry, ...rest].slice(0, maxRecentSelections);
            });
          },
          removeRecentSelection: (id) => {
            const recentSelections = get().recentSelections;
            if (!recentSelections.some((entry) => entry.id === id)) return;
            set((state) => {
              state.recentSelections = recentSelections.filter((entry) => entry.id !== id);
            });
          },
          toggleSearchCollapsed: (entityType) => {
            set((state) => {
              state.searchCollapsedTypes[entityType] = !state.searchCollapsedTypes[entityType];
            });
          },
          setNavSheetOpen: (navSheetOpen, organizationId = null) => {
            set((state) => {
              state.navSheetOpen = navSheetOpen;
              if (!navSheetOpen) {
                state.navSheetPanel = null;
                return;
              }
              state.navSheetOrganizationId = organizationId;
              if (organizationId) state.lastOrganizationId = organizationId;
            });
          },
          setLastChannelId: (organizationId, channelId) => {
            // Every resolved navigation reports, a search change too: an unchanged id would still write the persisted store
            if (get().lastChannelIds[organizationId] === channelId) return;
            set((state) => {
              state.lastChannelIds[organizationId] = channelId;
            });
          },
          setKeepNavOpen: (keepNavOpen) => {
            set((state) => {
              state.keepNavOpen = keepNavOpen;
            });
          },
          setKeepOpenPreference: (keepOpenPreference) => {
            set((state) => {
              state.keepOpenPreference = keepOpenPreference;
            });
          },
          setDetailedMenu: (detailedMenu) => {
            set((state) => {
              state.detailedMenu = detailedMenu;
            });
          },
          setFloatingNavActive: (floatingNavActive) => {
            set((state) => {
              state.floatingNavActive = floatingNavActive;
            });
          },
          setSectionOpen: (sectionKey, open) => {
            set((state) => {
              state.activeSections = { ...state.activeSections, [sectionKey]: open };
            });
          },
          resetSections: () => {
            set((state) => {
              state.activeSections = null;
            });
          },
          toggleNavSheetPanel: (panel) => {
            set((state) => {
              state.navSheetPanel = state.navSheetPanel === panel ? null : panel;
            });
          },
          reset: () => set(initStore),
        }),
        {
          // Version 1 kept recent selections per entity type: those start over
          version: 2,
          migrate: (persisted) => ({ ...(isRecord(persisted) ? persisted : {}), recentSelections: [] }),
          name: 'navigation',
          skipHydration: true,
          partialize: (state) => ({
            keepOpenPreference: state.keepOpenPreference,
            detailedMenu: state.detailedMenu,
            activeSections: state.activeSections,
            recentSearches: state.recentSearches,
            recentSelections: state.recentSelections,
            searchCollapsedTypes: state.searchCollapsedTypes,
            lastOrganizationId: state.lastOrganizationId,
            lastChannelIds: state.lastChannelIds,
          }),
          storage: createJSONStorage(() => idbKvStorage('navigation')),
        },
      ),
    ),
    { enabled: isDebugMode, name: 'navigation store' },
  ),
);

export { useNavigationStore as navigationStore };
