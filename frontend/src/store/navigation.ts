import type { EntityType } from 'backend/types/common';
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
  hideSubmenu: boolean;
  toggleHideSubmenu: (status: boolean) => void;
  activeSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  setSection: (section: string, sectionState: boolean) => void;
  navLoading: boolean;
  setLoading: (status: boolean) => void;
  focusView: boolean;
  submenuItemsOrder: Record<string, string[]>;
  setSubmenuItemsOrder: (workspaceId: string, itemIds: string[]) => void;
  setFocusView: (status: boolean) => void;
  archiveStateToggle: (itemId: string, active: boolean, workspaceId?: string) => void;
}

const initialMenuState: UserMenu = menuSections
  .filter((el) => !el.isSubmenu)
  .reduce<UserMenu>((acc, section) => {
    acc[section.storageType as keyof UserMenu] = { items: [], canCreate: false, type: null as unknown as EntityType };
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
          hideSubmenu: false as boolean,
          navLoading: false as boolean,
          focusView: false as boolean,
          activeItemsOrder: {
            organizations: [],
            workspaces: [],
          },
          submenuItemsOrder: {},
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
          archiveStateToggle: (itemId: string, active: boolean, workspaceId?: string) => {
            set((state) => {
              if (!workspaceId) {
                for (const sectionKey of Object.keys(state.menu)) {
                  const section = state.menu[sectionKey as keyof UserMenu];
                  const itemIndex = section.items.findIndex((item) => item.id === itemId);
                  if (itemIndex !== -1) state.menu[sectionKey as keyof UserMenu].items[itemIndex].archived = active;
                }
              } else {
                const section = state.menu.workspaces;
                const workspace = section.items.find((item) => item.id === workspaceId);
                if (!workspace || !workspace.submenu) return;
                const itemIndex = workspace.submenu.items.findIndex((item) => item.id === itemId);
                if (itemIndex && itemIndex !== -1) workspace.submenu.items[itemIndex].archived = active;
              }
            });
          },
          setActiveItemsOrder: (sectionName: keyof UserMenu, itemIds: string[]) => {
            set((state) => {
              state.activeItemsOrder[sectionName] = itemIds;
            });
          },
          setSubmenuItemsOrder: (workspaceId: string, itemIds: string[]) => {
            set((state) => {
              state.submenuItemsOrder[workspaceId] = itemIds;
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
            activeItemsOrder: state.activeItemsOrder,
            submenuItemsOrder: state.submenuItemsOrder,
          }),
          storage: createJSONStorage(() => localStorage),
        },
      ),
    ),
  ),
);
