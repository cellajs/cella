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
  addToInactive: (itemId: string) => void;
}

interface MenuSection {
  name: string;
  role: 'ADMIN' | 'MEMBER' | null;
  id: string;
  slug: string;
  thumbnailUrl: string | null;
  createdAt: string;
  modifiedAt: string | null;
  counts: {
    members: number;
    admins: number;
  };
  muted: boolean;
  archived: boolean;
}

interface ItemMenu {
  organizations: {
    info: MenuSection[];
    canCreate: boolean;
  };
  workspaces: {
    info: MenuSection[];
    canCreate: boolean;
  };
  projects: {
    info: MenuSection[];
    canCreate: boolean;
  };
}

const initialMenuState: ItemMenu = menuSections.reduce<ItemMenu>((acc, section) => {
  acc[section.id as keyof ItemMenu] = { info: [], canCreate: false };
  return acc;
}, {} as ItemMenu);

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
          addToInactive: (itemId: string) => {
            set((state) => {
              state.menu = Object.keys(state.menu).reduce((acc, key) => {
                acc[key as keyof ItemMenu] = {
                  ...state.menu[key as keyof ItemMenu],
                  info: state.menu[key as keyof ItemMenu].info.map((item) => {
                    if (item.id !== itemId) return item;
                    return {
                      ...item,
                      archived: true,
                    };
                  }),
                };
                return acc;
              }, {} as ItemMenu);
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
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
