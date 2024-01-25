import config from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { NavItem } from '~/components/app-nav';
import { getUserMenu } from '~/api/api';
import { UserMenu } from '~/types';
import { menuSections } from '~/components/app-sheet/sheet-menu';

interface NavigationState {
  activeSheet: NavItem | null;
  setSheet: (activeSheet: NavItem | null) => void;
  menu: UserMenu;
  getMenu(): Promise<void>;
  keepMenuOpen: boolean;
  toggleKeepMenu: (status: boolean) => void;
  activeSections: Record<string, boolean>;
  setActiveSections: (sections: Record<string, boolean>) => void;
}

const initialMenuState = menuSections.reduce<UserMenu>((acc, section) => {
  acc[section.name as keyof UserMenu] = { active: [], inactive: [], canCreate: false };
  return acc;
}, {} as UserMenu);

export const useNavigationStore = create<NavigationState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          activeSheet: null,
          keepMenuOpen: false,
          setSheet: (component) => {
            set((state) => {
              state.activeSheet = component;
            });
          },
          menu: initialMenuState,
          async getMenu () {
            const menu = await getUserMenu();
            set((state) => {
              state.menu = menu;
            });
          },
          toggleKeepMenu: (status) => {
            set((state) => {
              state.keepMenuOpen = status;
            });
          },
          activeSections: {},
          setActiveSections: (sections) => {
            set((state) => {
              state.activeSections = sections;
            });
          },
        }),
        {
          name: `${config.slug}-navigation`,
          partialize: (state) => ({
            keepMenuOpen: state.keepMenuOpen,
            // TODO: How to get the React Elements in the object after refresh? activeSheet: state.activeSheet,
            activeSections: state.activeSections,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
