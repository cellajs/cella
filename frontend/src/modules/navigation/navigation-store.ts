import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { NavItemId } from '~/modules/navigation/types';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface NavigationStoreState {
  recentSearches: string[]; // Search values entered in AppSearch
  setRecentSearches: (searchValue: string[]) => void;

  navSheetOpen: NavItemId | null;
  setNavSheetOpen: (sheet: NavItemId | null) => void;

  keepNavOpen: boolean; // Nav sheet stays open beside the content
  setKeepNavOpen: (status: boolean) => void;

  keepOpenPreference: boolean; // User preference behind keepNavOpen
  toggleKeepOpenPreference: (status: boolean) => void;

  detailedMenu: boolean; // Menu sheet shows submenus
  toggleDetailedMenu: (status: boolean) => void;

  activeSections: Record<string, boolean> | null; // Expanded state per section, including archived ones
  toggleSection: (section: string) => void;
  setSectionsDefault: () => void;

  menuSheetPanel: string | null; // Open bottom panel in the menu sheet; at most one
  toggleMenuSheetPanel: (panel: string) => void;

  floatingNavActive: boolean; // Floating nav is visible, which hides the bottom bar
  setFloatingNavActive: (status: boolean) => void;

  reset: () => void; // Called on sign-out
}

interface InitStore
  extends Pick<
    NavigationStoreState,
    | 'recentSearches'
    | 'keepNavOpen'
    | 'detailedMenu'
    | 'activeSections'
    | 'navSheetOpen'
    | 'keepOpenPreference'
    | 'floatingNavActive'
    | 'menuSheetPanel'
  > {}

const initStore: InitStore = {
  recentSearches: [],
  navSheetOpen: null,
  keepNavOpen: false, // Managed reactively by app-nav effect
  keepOpenPreference: false,
  detailedMenu: false,
  floatingNavActive: false,
  activeSections: null,
  menuSheetPanel: null,
};

export const useNavigationStore = create<NavigationStoreState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          ...initStore,
          setNavSheetOpen: (sheet) => {
            set((state) => {
              state.navSheetOpen = sheet;
              if (!sheet) state.menuSheetPanel = null;
            });
          },
          setRecentSearches: (searchValues: string[]) => {
            set((state) => {
              state.recentSearches = searchValues;
            });
          },
          setKeepNavOpen: (status) => {
            set((state) => {
              state.keepNavOpen = status;
            });
          },
          toggleKeepOpenPreference: (status) => {
            set((state) => {
              state.keepOpenPreference = status;
            });
          },
          toggleDetailedMenu: (status) => {
            set((state) => {
              state.detailedMenu = status;
            });
          },
          setFloatingNavActive: (status) => {
            set((state) => {
              state.floatingNavActive = status;
            });
          },
          toggleSection: (section) => {
            set((state) => {
              if (!state.activeSections) state.activeSections = { [section]: false };
              else if (state.activeSections[section] !== undefined)
                state.activeSections[section] = !state.activeSections[section];
              else state.activeSections = { ...state.activeSections, ...{ [section]: false } };
            });
          },
          setSectionsDefault: () => {
            set((state) => {
              state.activeSections = null;
            });
          },
          toggleMenuSheetPanel: (panel) => {
            set((state) => {
              state.menuSheetPanel = state.menuSheetPanel === panel ? null : panel;
            });
          },
          reset: () => set(initStore),
        }),
        {
          version: 1,
          name: 'navigation',
          skipHydration: true,
          partialize: (state) => ({
            keepOpenPreference: state.keepOpenPreference,
            detailedMenu: state.detailedMenu,
            activeSections: state.activeSections,
            recentSearches: state.recentSearches,
          }),
          storage: createJSONStorage(() => idbKvStorage('navigation')),
        },
      ),
    ),
    { enabled: isDebugMode, name: 'navigation store' },
  ),
);

// Non-hook alias for use outside React components (e.g. getState).
export { useNavigationStore as navigationStore };
