import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';

import type { NavItemId } from '~/modules/navigation/types';

interface NavigationStoreState {
  recentSearches: string[]; // Recent search (from AppSearch),
  setRecentSearches: (searchValue: string[]) => void; // Updates recent searches

  navSheetOpen: NavItemId | null; // Currently open navigation sheet
  setNavSheetOpen: (sheet: NavItemId | null) => void; // Sets navigation sheet

  keepNavOpen: boolean; // Nav sheet remains open state
  setKeepNavOpen: (status: boolean) => void; // Toggles nav open state

  keepOpenPreference: boolean; // User Preference for keeping the menu open
  toggleKeepOpenPreference: (status: boolean) => void; // Toggles keep-open preference

  detailedMenu: boolean; // Hides submenu state(for Menu sheet)
  toggleDetailedMenu: (status: boolean) => void; // Toggles submenu visibility

  activeSections: Record<string, boolean> | null; // Tracks expanded/collapsed entities sections and their archived sections
  toggleSection: (section: string) => void; // Toggle a section expanded/collapsed state
  setSectionsDefault: () => void; // Resets all sections to default state

  navLoading: boolean; // Navigation is in a loading state
  setNavLoading: (status: boolean) => void; // Updates the loading state
}

interface InitStore
  extends Pick<
    NavigationStoreState,
    | 'recentSearches'
    | 'keepNavOpen'
    | 'detailedMenu'
    | 'navLoading'
    | 'activeSections'
    | 'navSheetOpen'
    | 'keepOpenPreference'
  > {}

// Default state values
const initStore: InitStore = {
  recentSearches: [],
  navSheetOpen: null,
  keepNavOpen: false, // Managed reactively by app-nav effect
  keepOpenPreference: false,
  detailedMenu: false,
  navLoading: false,
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
          setNavLoading: (status) => {
            set((state) => {
              state.navLoading = status;
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
    { enabled: isDebugMode, name: 'navigation store' },
  ),
);
