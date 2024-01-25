import config from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getUserMenu } from '~/api/api';
import { NavItem } from '~/components/app-nav';
import { menuSections } from '~/components/app-sheet/sheet-menu';
import { UserMenu } from '~/types';

interface NavigationState {
  activeSheet: NavItem | null;
  setSheet: (activeSheet: NavItem | null) => void;
  menu: UserMenu;
  getMenu(): Promise<UserMenu | null>;
  keepMenuOpen: boolean;
  toggleKeepMenu: (status: boolean) => void;
  activeSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
}

// Build the initial menu (for menu sheet)
const initialMenuState = menuSections.reduce<UserMenu>((acc, section) => {
  acc[section.name as keyof UserMenu] = { active: [], inactive: [], canCreate: false };
  return acc;
}, {} as UserMenu);

export const useNavigationStore = create<NavigationState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          activeSheet: null as NavItem | null,
          keepMenuOpen: false as boolean,
          menu: initialMenuState,
          activeSections: {},
          setSheet: (component) => {
            set((state) => {
              state.activeSheet = component;
            });
          },
          async getMenu () {
            const menu = await getUserMenu();
            set((state) => {
              state.menu = menu as UserMenu;
            });

            return menu || null;
          },
          toggleKeepMenu: (status) => {
            set((state) => {
              state.keepMenuOpen = status;
            });
          },
          toggleSection: (section) => {
            set((state) => {
              state.activeSections[section] = !state.activeSections[section];
            });
          },
        }),
        {
          name: `${config.slug}-navigation`,
          partialize: (state) => ({
            keepMenuOpen: state.keepMenuOpen,
            activeSections: state.activeSections,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
