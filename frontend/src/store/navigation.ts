import type { EntityContextType } from 'backend/types/common';
import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { NavItem } from '~/modules/common/app-nav';
import { menuSections } from '~/modules/common/nav-sheet/sheet-menu';
import type { UserMenu } from '~/types';

type EntitySubList = Record<string, string[]>;
type EntityConfig = Record<EntityContextType, { mainList: string[]; subList: EntitySubList }>;

interface NavigationState {
  recentSearches: string[];
  menuOrder: EntityConfig;
  setRecentSearches: (searchValue: string[]) => void;
  activeSheet: NavItem | null;
  setSheet: (activeSheet: NavItem | null) => void;
  menu: UserMenu;
  keepMenuOpen: boolean;
  toggleKeepMenu: (status: boolean) => void;
  hideSubmenu: boolean;
  toggleHideSubmenu: (status: boolean) => void;
  activeSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  setSection: (section: string, sectionState: boolean) => void;
  navLoading: boolean;
  setLoading: (status: boolean) => void;
  focusView: boolean;
  setFocusView: (status: boolean) => void;
  archiveStateToggle: (itemId: string, active: boolean, mainId?: string | null) => void;
  setMainMenuOrder: (entityType: EntityContextType, mainListOrder: string[]) => void;
  setSubMenuOrder: (entityType: EntityContextType, mainId: string, subItemIds: string[]) => void;
}

const initialMenuState: UserMenu = menuSections
  .filter((el) => !el.isSubmenu)
  .reduce<UserMenu>((acc, section) => {
    acc[section.storageType as keyof UserMenu] = { items: [], canCreate: false, type: null as unknown as EntityContextType };
    return acc;
  }, {} as UserMenu);

export const useNavigationStore = create<NavigationState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          menuOrder: {} as EntityConfig,
          recentSearches: [] as string[],
          activeSheet: null as NavItem | null,
          keepMenuOpen: false as boolean,
          hideSubmenu: false as boolean,
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
          toggleHideSubmenu: (status) => {
            set((state) => {
              state.hideSubmenu = status;
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
          setSection: (section, sectionState) => {
            set((state) => {
              state.activeSections[section] = sectionState;
            });
          },
          archiveStateToggle: (itemId: string, active: boolean, mainId?: string | null) => {
            set((state) => {
              if (!mainId) {
                for (const sectionKey of Object.keys(state.menu)) {
                  const section = state.menu[sectionKey as keyof UserMenu];
                  const itemIndex = section.items.findIndex((item) => item.id === itemId);
                  if (itemIndex !== -1) state.menu[sectionKey as keyof UserMenu].items[itemIndex].archived = active;
                }
              } else {
                const section = state.menu.workspaces;
                const workspace = section.items.find((item) => item.id === mainId);
                if (!workspace || !workspace.submenu) return;
                const itemIndex = workspace.submenu.items.findIndex((item) => item.id === itemId);
                if (itemIndex && itemIndex !== -1) workspace.submenu.items[itemIndex].archived = active;
              }
            });
          },
          setMainMenuOrder: (entityType: EntityContextType, mainListOrder: string[]) => {
            set((state) => {
              return {
                ...state,
                menuOrder: {
                  ...state.menuOrder,
                  [entityType]: { ...state.menuOrder[entityType], mainList: mainListOrder },
                },
              };
            });
          },
          setSubMenuOrder: (entityType: EntityContextType, mainId: string, subItemIds: string[]) => {
            set((state) => {
              return {
                menuOrder: {
                  ...state.menuOrder,
                  [entityType]: {
                    ...state.menuOrder[entityType],
                    subList: {
                      ...state.menuOrder[entityType]?.subList,
                      [mainId]: subItemIds,
                    },
                  },
                },
              };
            });
          },
        }),
        {
          version: 1,
          name: `${config.slug}-navigation`,
          partialize: (state) => ({
            keepMenuOpen: state.keepMenuOpen,
            hideSubmenu: state.hideSubmenu,
            activeSections: state.activeSections,
            recentSearches: state.recentSearches,
            menuOrder: state.menuOrder,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
