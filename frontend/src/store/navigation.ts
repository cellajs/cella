import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { NavItem } from '~/modules/common/app-nav';
import { menuSections } from '~/modules/common/nav-sheet/sheet-menu';
import type { UserMenu } from '~/types';

interface NavigationState {
  resentSearches: string[];
  setResentSearches: (searchValue: string[]) => void;
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
}

// Build the initial menu (for menu sheet)
const initialMenuState = menuSections.reduce<UserMenu>((acc, section) => {
  acc[section.id as keyof UserMenu] = { active: [], inactive: [], canCreate: false };
  return acc;
}, {} as UserMenu);

export const useNavigationStore = create<NavigationState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          resentSearches: [] as string[],
          activeSheet: null as NavItem | null,
          keepMenuOpen: false as boolean,
          navLoading: false as boolean,
          focusView: false as boolean,
          menu: initialMenuState,
          activeSections: {},
          setResentSearches: (searchValues: string[]) => {
            set((state) => {
              state.resentSearches = searchValues;
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
        }),
        {
          version: 1,
          name: `${config.slug}-navigation`,
          partialize: (state) => ({
            keepMenuOpen: state.keepMenuOpen,
            activeSections: state.activeSections,
            resentSearches: state.resentSearches,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
