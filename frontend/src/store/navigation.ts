import { appConfig } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { NavItemId } from '~/modules/navigation/types';

interface NavigationStoreState {
  recentSearches: string[]; // Recent search (from AppSearch),
  setRecentSearches: (searchValue: string[]) => void; // Updates recent searches

  navSheetOpen: NavItemId | null; // Currently open navigation sheet
  setNavSheetOpen: (sheet: NavItemId | null, isDesktop?: boolean) => void; // Sets navigation sheet

  keepMenuOpen: boolean; // Menu remains open state
  setKeepMenuOpen: (status: boolean) => void; // Toggles menu open state

  keepOpenPreference: boolean; // User Preference for keeping the menu open
  toggleKeepOpenPreference: (status: boolean, isDesktop?: boolean) => void; // Toggles keep-open preference

  detailedMenu: boolean; // Hides submenu state(for Menu sheet)
  toggleDetailedMenu: (status: boolean) => void; // Toggles submenu visibility

  activeSections: Record<string, boolean> | null; // Tracks expanded/collapsed entities sections and their archived sections
  toggleSection: (section: string) => void; // Toggle a section expanded/collapsed state
  setSectionsDefault: () => void; // Resets all sections to default state

  navLoading: boolean; // Navigation is in a loading state
  setNavLoading: (status: boolean) => void; // Updates the loading state

  focusView: boolean; // Focused view mode state
  setFocusView: (status: boolean) => void; // Toggles focus view state
}

interface InitStore
  extends Pick<
    NavigationStoreState,
    | 'recentSearches'
    | 'keepMenuOpen'
    | 'detailedMenu'
    | 'navLoading'
    | 'focusView'
    | 'activeSections'
    | 'navSheetOpen'
    | 'keepOpenPreference'
  > {}

// Default state values
const initStore: InitStore = {
  recentSearches: [],
  navSheetOpen: null,
  keepMenuOpen: window.innerWidth > 1280, // Auto-open menu on wider screens
  keepOpenPreference: false,
  detailedMenu: false,
  navLoading: false,
  focusView: false,
  activeSections: null,
};

/**
 * Navigation store for managing navigation state: menu, recent searches, onboarding
 */
export const useNavigationStore = create<NavigationStoreState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          ...initStore,
          setNavSheetOpen: (sheet, isDesktop) => {
            set((state) => {
              const wasMenu = state.navSheetOpen === 'menu';
              const isMenu = sheet === 'menu';
              state.navSheetOpen = sheet;
              // Update keepMenuOpen when on desktop with preference enabled
              if (isDesktop !== undefined) {
                state.keepMenuOpen = isDesktop && state.keepOpenPreference && (isMenu || wasMenu);
              }
            });
          },
          setRecentSearches: (searchValues: string[]) => {
            set((state) => {
              state.recentSearches = searchValues;
            });
          },
          setKeepMenuOpen: (status) => {
            set((state) => {
              state.keepMenuOpen = status;
            });
          },
          toggleKeepOpenPreference: (status, isDesktop) => {
            set((state) => {
              state.keepOpenPreference = status;
              // Also update keepMenuOpen if we know isDesktop and menu is open
              if (isDesktop !== undefined && state.navSheetOpen === 'menu') {
                state.keepMenuOpen = isDesktop && status;
              }
            });
          },
          toggleDetailedMenu: (status) => {
            set((state) => {
              state.detailedMenu = status;
            });
          },
          setNavLoading: (status) => {
            set((state) => {
              state.navLoading = status;
            });
          },
          setFocusView: (status) => {
            set((state) => {
              state.focusView = status;
              // Only move scroll to table if .focus-view-scroll is present
              if (status && document.getElementsByClassName('focus-view-scroll').length) {
                document.body.classList.add('focus-view-table');
              } else {
                document.body.classList.remove('focus-view-table');
              }
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
        }),
        {
          version: 8,
          name: `${appConfig.slug}-navigation`,
          partialize: (state) => ({
            keepOpenPreference: state.keepOpenPreference,
            detailedMenu: state.detailedMenu,
            activeSections: state.activeSections,
            recentSearches: state.recentSearches,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
