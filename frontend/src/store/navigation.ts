import config from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { NavItem } from '~/components/app-nav';

interface NavigationState {
  activeSheet: NavItem | null;
  keepMenuOpen: boolean;
  setSheet: (activeSheet: NavItem | null) => void;
  toggleKeepMenu: (status: boolean) => void;
  activeSections: Record<string, boolean>;
  setActiveSections: (sections: Record<string, boolean>) => void;
}

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
