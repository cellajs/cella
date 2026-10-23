import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { NavItemId } from '~/modules/navigation/types';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface NavigationStoreState {
  recentSearches: string[]; // Search values entered in AppSearch

  navSheetOpen: NavItemId | null;
  setNavSheetOpen: (navSheetOpen: NavItemId | null) => void;

  keepNavOpen: boolean; // Nav sheet stays open beside the content
  setKeepNavOpen: (keepNavOpen: boolean) => void;

  keepOpenPreference: boolean; // User preference behind keepNavOpen
  setKeepOpenPreference: (keepOpenPreference: boolean) => void;

  detailedMenu: boolean; // Menu sheet shows submenus
  setDetailedMenu: (detailedMenu: boolean) => void;

  activeSections: Record<string, boolean> | null; // Expanded state per section, including archived ones
  toggleSection: (sectionKey: string) => void;
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
    | 'keepNavOpen'
    | 'detailedMenu'
    | 'activeSections'
    | 'navSheetOpen'
    | 'keepOpenPreference'
    | 'floatingNavActive'
    | 'navSheetPanel'
  > {}

const initStore: InitStore = {
  recentSearches: [],
  navSheetOpen: null,
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
        (set) => ({
          ...initStore,
          setNavSheetOpen: (navSheetOpen) => {
            set((state) => {
              state.navSheetOpen = navSheetOpen;
              if (!navSheetOpen) state.navSheetPanel = null;
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
          toggleSection: (sectionKey) => {
            set((state) => {
              if (!state.activeSections) state.activeSections = { [sectionKey]: false };
              else if (state.activeSections[sectionKey] !== undefined) state.activeSections[sectionKey] = !state.activeSections[sectionKey];
              else state.activeSections = { ...state.activeSections, ...{ [sectionKey]: false } };
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

export { useNavigationStore as navigationStore };
