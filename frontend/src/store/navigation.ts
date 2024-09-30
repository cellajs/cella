import type { ContextEntity } from 'backend/types/common';
import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { NavItem } from '~/modules/common/main-nav';
import { menuSections } from '~/nav-config';

import type { UserMenu, UserMenuItem } from '~/types/common';
import { objectKeys } from '~/utils/object';

type EntitySubList = Record<string, string[]>;
export type EntityConfig = Record<ContextEntity, { mainList: string[]; subList: EntitySubList }>;

interface NavigationState {
  recentSearches: string[];
  setRecentSearches: (searchValue: string[]) => void;
  activeSheet: NavItem | null;
  setSheet: (activeSheet: NavItem | null, action?: 'force' | 'routeChange') => void;
  menu: UserMenu;
  keepMenuOpen: boolean;
  toggleKeepMenu: (status: boolean) => void;
  hideSubmenu: boolean;
  toggleHideSubmenu: (status: boolean) => void;
  activeSections: Record<string, boolean> | null;
  toggleSection: (section: string) => void;
  setSectionsDefault: () => void;
  navLoading: boolean;
  setLoading: (status: boolean) => void;
  focusView: boolean;
  setFocusView: (status: boolean) => void;
  archiveStateToggle: (item: UserMenuItem, active: boolean, parentId?: string | null) => void;
  finishedOnboarding: boolean;
  setFinishedOnboarding: () => void;
  clearNavigationStore: () => void;
}

interface InitStore
  extends Pick<
    NavigationState,
    'recentSearches' | 'activeSheet' | 'keepMenuOpen' | 'hideSubmenu' | 'navLoading' | 'focusView' | 'menu' | 'activeSections' | 'finishedOnboarding'
  > {}

const initialMenuState: UserMenu = menuSections
  .filter((el) => !el.isSubmenu)
  .reduce((acc, section) => {
    acc[section.storageType] = [];
    return acc;
  }, {} as UserMenu);

const initStore: InitStore = {
  recentSearches: [],
  activeSheet: null,
  keepMenuOpen: false,
  hideSubmenu: false,
  navLoading: false,
  focusView: false,
  menu: initialMenuState,
  activeSections: null,
  finishedOnboarding: false,
};

export const useNavigationStore = create<NavigationState>()(
  devtools(
    immer(
      persist(
        (set) => ({
          ...initStore,
          setRecentSearches: (searchValues: string[]) => {
            set((state) => {
              state.recentSearches = searchValues;
            });
          },
          setSheet: (component, action) => {
            set((state) => {
              // If the action is 'force', set the activeSheet to the provided component directly
              if (action === 'force') state.activeSheet = component;
              if (action === 'routeChange') {
                const shouldStayOpen = state.activeSheet?.id === 'menu' && state.keepMenuOpen;
                const smallScreen = window.innerWidth < 1280;
                if (!shouldStayOpen || smallScreen) state.activeSheet = null;
                return;
              }
              // For any other action, set the activeSheet to the provided component
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
          archiveStateToggle: (item: UserMenuItem, active: boolean, parentId?: string | null) => {
            set((state) => {
              if (!parentId) {
                // Update the 'archived' status for the item in all sections
                for (const sectionKey of objectKeys(state.menu)) {
                  const section = state.menu[sectionKey];
                  const itemIndex = section.findIndex((el) => el.id === item.id);
                  if (itemIndex !== -1) state.menu[sectionKey][itemIndex].membership.archived = active;
                }
              } else {
                // Update the 'archived' status for the item in a specific submenu
                const section = menuSections.find((el) => el.type === item.entity)?.storageType;
                if (!section) return;
                const parent = state.menu[section].find((item) => item.id === parentId);
                if (!parent || !parent.submenu) return;
                const itemIndex = parent.submenu.findIndex((el) => el.id === item.id);
                if (itemIndex && itemIndex !== -1) parent.submenu[itemIndex].membership.archived = active;
              }
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
          version: 4,
          name: `${config.slug}-navigation`,
          partialize: (state) => ({
            menu: state.menu,
            keepMenuOpen: state.keepMenuOpen,
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
