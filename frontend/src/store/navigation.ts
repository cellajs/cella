import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { NavItem } from '~/modules/common/app-nav';
import { menuSections } from '~/modules/common/nav-sheet/sheet-menu';
import type { UserMenu } from '~/types';

interface NavigationState {
  recentSearches: string[];
  setRecentSearches: (searchValue: string[]) => void;
  activeItemsOrder: Record<keyof UserMenu, string[]>;
  setActiveItemsOrder: (sectionName: keyof UserMenu, itemIds: string[]) => void;
  activeSheet: NavItem | null;
  setSheet: (activeSheet: NavItem | null) => void;
  menu: UserMenu;
  keepMenuOpen: boolean;
  toggleKeepMenu: (status: boolean) => void;
  activeSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  navLoading: boolean;
  setLoading: (status: boolean) => void;
  focusView: boolean;
  setFocusView: (status: boolean) => void;
  archiveStateToggle: (itemId: string, active: boolean) => void;
}

const initialMenuState: UserMenu = menuSections.reduce<UserMenu>((acc, section) => {
  acc[section.id as keyof UserMenu] = { items: [], canCreate: false };
  return acc;
}, {} as UserMenu);

export const useNavigationStore = create<NavigationState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          recentSearches: [] as string[],
          activeSheet: null as NavItem | null,
          keepMenuOpen: false as boolean,
          navLoading: false as boolean,
          focusView: false as boolean,
          activeItemsOrder: {
            organizations: [],
            workspaces: [],
            projects: [],
          },
          menu: initialMenuState,
          activeSections: {},
          setRecentSearches: (searchValues: string[]) => {
            set((state) => {
              state.recentSearches = searchValues;
            });
          },
          setSheet: (component) => {
            set((state) => {
              state.activeSheet = component;
            });
          },
          toggleKeepMenu: (status) => {
            set((state) => {
              state.keepMenuOpen = status;
            });
          },
          setLoading: (status) => {
            set((state) => {
              state.navLoading = status;
            });
          },
          setFocusView: (status) => {
            set((state) => {
              state.focusView = status;
              if (status) state.activeSheet = null;
            });
          },
          toggleSection: (section) => {
            set((state) => {
              state.activeSections[section] = !state.activeSections[section];
            });
          },
          archiveStateToggle: (itemId: string, active: boolean) => {
            set((state) => {
              for (const sectionKey of Object.keys(state.menu)) {
                const section = state.menu[sectionKey as keyof UserMenu];
                const itemIndex = section.items.findIndex((item) => item.id === itemId);
                if (itemIndex !== -1) state.menu[sectionKey as keyof UserMenu].items[itemIndex].archived = active;
              }
            });
          },
          setActiveItemsOrder: (sectionName: keyof UserMenu, itemIds: string[]) => {
            set((state) => {
              state.activeItemsOrder[sectionName] = itemIds;
            });
          },
        }),
        {
          version: 1,
          name: `${config.slug}-navigation`,
          partialize: (state) => ({
            keepMenuOpen: state.keepMenuOpen,
            activeSections: state.activeSections,
            recentSearches: state.recentSearches,
            activeItemsOrder: state.activeItemsOrder,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
