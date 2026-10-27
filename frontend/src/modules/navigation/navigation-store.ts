import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { NavItemId } from '~/modules/navigation/types';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface NavigationStoreState {
  recentSearches: string[]; // Search values entered in AppSearch

  navSheetOpen: NavItemId | null;
  navSheetOrganizationId: string | null; // Organization the open menu sheet holds alone; null while it lists every channel
  /** Opening with an `organizationId` also makes it the `lastOrganizationId`. */
  setNavSheetOpen: (navSheetOpen: NavItemId | null, organizationId?: string | null) => void;

  lastOrganizationId: string | null; // Organization last opened from the rail or the switcher, where the mobile menu opens outside organization pages

  lastChannelIds: Record<string, string>; // Per organization id, the channel below it that its pages last showed, where its rail button lands
  setLastChannelId: (organizationId: string, channelId: string) => void;

  keepNavOpen: boolean; // Nav sheet stays open beside the content
  setKeepNavOpen: (keepNavOpen: boolean) => void;

  keepOpenPreference: boolean; // User preference behind keepNavOpen
  setKeepOpenPreference: (keepOpenPreference: boolean) => void;

  detailedMenu: boolean; // Menu sheet shows submenus
  setDetailedMenu: (detailedMenu: boolean) => void;

  activeSections: Record<string, boolean> | null; // Expanded state per section the user toggled, including archived ones
  setSectionOpen: (sectionKey: string, open: boolean) => void;
  resetSections: () => void;

  navSheetPanel: string | null; // Open bottom panel of a nav sheet; at most one
  toggleNavSheetPanel: (panel: string) => void;

  floatingNavActive: boolean; // Floating nav is visible, which hides the bottom bar
  setFloatingNavActive: (floatingNavActive: boolean) => void;

  reset: () => void; // Called on sign-out
}

interface InitStore
  extends Pick<
    NavigationStoreState,
    | 'recentSearches'
    | 'keepNavOpen'
    | 'detailedMenu'
    | 'activeSections'
    | 'navSheetOpen'
    | 'navSheetOrganizationId'
    | 'lastOrganizationId'
    | 'lastChannelIds'
    | 'keepOpenPreference'
    | 'floatingNavActive'
    | 'navSheetPanel'
  > {}

const initStore: InitStore = {
  recentSearches: [],
  navSheetOpen: null,
  navSheetOrganizationId: null,
  lastOrganizationId: null,
  lastChannelIds: {},
  keepNavOpen: false, // Managed reactively by app-nav effect
  keepOpenPreference: false,
  detailedMenu: false,
  floatingNavActive: false,
  activeSections: null,
  navSheetPanel: null,
};

export const useNavigationStore = create<NavigationStoreState>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          ...initStore,
          setNavSheetOpen: (navSheetOpen, organizationId = null) => {
            set((state) => {
              state.navSheetOpen = navSheetOpen;
              state.navSheetOrganizationId = navSheetOpen ? organizationId : null;
              if (navSheetOpen && organizationId) state.lastOrganizationId = organizationId;
              if (!navSheetOpen) state.navSheetPanel = null;
            });
          },
          setLastChannelId: (organizationId, channelId) => {
            // Every resolved navigation reports, a search change too: an unchanged id would still write the persisted store
            if (get().lastChannelIds[organizationId] === channelId) return;
            set((state) => {
              state.lastChannelIds[organizationId] = channelId;
            });
          },
          setKeepNavOpen: (keepNavOpen) => {
            set((state) => {
              state.keepNavOpen = keepNavOpen;
            });
          },
          setKeepOpenPreference: (keepOpenPreference) => {
            set((state) => {
              state.keepOpenPreference = keepOpenPreference;
            });
          },
          setDetailedMenu: (detailedMenu) => {
            set((state) => {
              state.detailedMenu = detailedMenu;
            });
          },
          setFloatingNavActive: (floatingNavActive) => {
            set((state) => {
              state.floatingNavActive = floatingNavActive;
            });
          },
          setSectionOpen: (sectionKey, open) => {
            set((state) => {
              state.activeSections = { ...state.activeSections, [sectionKey]: open };
            });
          },
          resetSections: () => {
            set((state) => {
              state.activeSections = null;
            });
          },
          toggleNavSheetPanel: (panel) => {
            set((state) => {
              state.navSheetPanel = state.navSheetPanel === panel ? null : panel;
            });
          },
          reset: () => set(initStore),
        }),
        {
          version: 1,
          name: 'navigation',
          skipHydration: true,
          partialize: (state) => ({
            keepOpenPreference: state.keepOpenPreference,
            detailedMenu: state.detailedMenu,
            activeSections: state.activeSections,
            recentSearches: state.recentSearches,
            lastOrganizationId: state.lastOrganizationId,
            lastChannelIds: state.lastChannelIds,
          }),
          storage: createJSONStorage(() => idbKvStorage('navigation')),
        },
      ),
    ),
    { enabled: isDebugMode, name: 'navigation store' },
  ),
);

export { useNavigationStore as navigationStore };
