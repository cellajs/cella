import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { UserMenu } from '~/modules/me/types';
import type { NavItemId } from '~/modules/navigation/types';

interface NavigationStoreState {
  recentSearches: string[]; // Recent search (from AppSearch),
  setRecentSearches: (searchValue: string[]) => void; // Updates recent searches

  menu: UserMenu; // User menu
  navSheetOpen: NavItemId | null; // Currently open navigation sheet
  setNavSheetOpen: (sheet: NavItemId | null) => void; // Sets navigation sheet

  keepMenuOpen: boolean; // Menu remains open state
  setKeepMenuOpen: (status: boolean) => void; // Toggles menu open state

  keepOpenPreference: boolean; // User Preference for keeping the menu open
  toggleKeepOpenPreference: (status: boolean) => void; // Toggles keep-open preference

  hideSubmenu: boolean; // Hides submenu state(for Menu sheet)
  toggleHideSubmenu: (status: boolean) => void; // Toggles submenu visibility

  activeSections: Record<string, boolean> | null; // Tracks expanded/collapsed entities sections and their archived sections
  toggleSection: (section: string) => void; // Toggle a section expanded/collapsed state
  setSectionsDefault: () => void; // Resets all sections to default state

  navLoading: boolean; // Navigation is in a loading state
  setNavLoading: (status: boolean) => void; // Updates the loading state

  focusView: boolean; // Focused view mode state
  setFocusView: (status: boolean) => void; // Toggles focus view state

  finishedOnboarding: boolean; // Tracks if the user has completed onboarding
  setFinishedOnboarding: () => void; // Marks onboarding as complete

  clearNavigationStore: () => void; // Resets navigation store to initial state
}

// Defines the initial menu structure, excluding submenu items
const initialMenuState: UserMenu = config.menuStructure.reduce((acc, { entityType }) => {
  acc[entityType] = [];
  return acc;
}, {} as UserMenu);

interface InitStore
  extends Pick<
    NavigationStoreState,
    | 'recentSearches'
    | 'keepMenuOpen'
    | 'hideSubmenu'
    | 'navLoading'
    | 'focusView'
    | 'menu'
    | 'activeSections'
    | 'finishedOnboarding'
    | 'navSheetOpen'
    | 'keepOpenPreference'
  > {}

// Default state values
const initStore: InitStore = {
  recentSearches: [],
  navSheetOpen: null,
  keepMenuOpen: window.innerWidth > 1280, // Auto-open menu on wider screens
  keepOpenPreference: false,
  hideSubmenu: false,
  navLoading: false,
  focusView: false,
  menu: initialMenuState,
  activeSections: null,
  finishedOnboarding: false,
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
          setNavSheetOpen: (sheet) => {
            set((state) => {
              state.navSheetOpen = sheet;
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
          toggleKeepOpenPreference: (status) => {
            set((state) => {
              state.keepOpenPreference = status;
            });
          },
          toggleHideSubmenu: (status) => {
            set((state) => {
              state.hideSubmenu = status;
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
              else if (state.activeSections[section] !== undefined) state.activeSections[section] = !state.activeSections[section];
              else state.activeSections = { ...state.activeSections, ...{ [section]: false } };
            });
          },
          setSectionsDefault: () => {
            set((state) => {
              state.activeSections = null;
            });
          },
          setFinishedOnboarding: () => {
            set((state) => {
              state.finishedOnboarding = true;
            });
          },
          clearNavigationStore: () =>
            set((state) => ({
              ...state,
              ...initStore,
            })),
        }),
        {
          version: 6,
          name: `${config.slug}-navigation`,
          partialize: (state) => ({
            menu: state.menu,
            keepOpenPreference: state.keepOpenPreference,
            hideSubmenu: state.hideSubmenu,
            activeSections: state.activeSections,
            recentSearches: state.recentSearches,
            finishedOnboarding: state.finishedOnboarding,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
