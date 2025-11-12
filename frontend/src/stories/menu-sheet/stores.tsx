import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { UserMenu } from '~/modules/me/types';
import { mockMenu, mockUser } from '~/stories/menu-sheet/mock/data';

// Mock Navigation Store
export interface MockNavigationStoreState {
  recentSearches: string[];
  setRecentSearches: (searchValue: string[]) => void;
  menu: UserMenu;
  navSheetOpen: string | null;
  setNavSheetOpen: (sheet: string | null) => void;
  keepMenuOpen: boolean;
  setKeepMenuOpen: (status: boolean) => void;
  keepOpenPreference: boolean;
  toggleKeepOpenPreference: (status: boolean) => void;
  detailedMenu: boolean;
  toggleDetailedMenu: (status: boolean) => void;
  activeSections: Record<string, boolean> | null;
  toggleSection: (section: string) => void;
  setSectionsDefault: () => void;
  navLoading: boolean;
  setNavLoading: (status: boolean) => void;
  focusView: boolean;
  setFocusView: (status: boolean) => void;
  clearNavigationStore: () => void;
}

export const createMockNavigationStore = (initialMenu: UserMenu = mockMenu) => {
  return create<MockNavigationStoreState>()(
    devtools((set, get) => ({
      recentSearches: [],
      menu: initialMenu,
      navSheetOpen: null,
      keepMenuOpen: true,
      keepOpenPreference: false,
      detailedMenu: false,
      navLoading: false,
      focusView: false,
      activeSections: null,
      setRecentSearches: (searchValues) => set({ recentSearches: searchValues }),
      setNavSheetOpen: (sheet) => set({ navSheetOpen: sheet }),
      setKeepMenuOpen: (status) => set({ keepMenuOpen: status }),
      toggleKeepOpenPreference: () => set((state) => ({ keepOpenPreference: !state.keepOpenPreference })),
      toggleDetailedMenu: () => set((state) => ({ detailedMenu: !state.detailedMenu })),
      setNavLoading: (status) => set({ navLoading: status }),
      setFocusView: (status) => set({ focusView: status }),
      toggleSection: (section) => {
        const { activeSections } = get();
        if (!activeSections) {
          set({ activeSections: { [section]: false } });
        } else if (activeSections[section] !== undefined) {
          set({
            activeSections: {
              ...activeSections,
              [section]: !activeSections[section],
            },
          });
        } else {
          set({
            activeSections: {
              ...activeSections,
              [section]: false,
            },
          });
        }
      },
      setSectionsDefault: () => set({ activeSections: null }),
      clearNavigationStore: () => set({ menu: {} as UserMenu }),
    })),
  );
};

// Mock User Store
export interface MockUserStoreState {
  user: typeof mockUser;
  hasPasskey: boolean;
  hasTotp: boolean;
  enabledOAuth: string[];
  lastUser: Partial<typeof mockUser> | null;
  setUser: (user: typeof mockUser, skipLastUser?: boolean) => void;
  setLastUser: (lastUser: Partial<typeof mockUser>) => void;
  setMeAuthData: (data: Partial<{ hasPasskey: boolean; hasTotp: boolean; enabledOAuth: string[] }>) => void;
  updateUser: (user: Partial<typeof mockUser>) => void;
  clearUserStore: () => void;
}

export const createMockUserStore = (initialUser: typeof mockUser = mockUser) => {
  return create<MockUserStoreState>()(
    devtools((set) => ({
      user: initialUser,
      hasPasskey: false,
      hasTotp: false,
      enabledOAuth: [],
      lastUser: null,
      setUser: (user, skipLastUser) => {
        set((state) => ({
          user,
          lastUser: skipLastUser ? state.lastUser : { email: user.email, name: user.name, id: user.id, slug: user.slug },
        }));
      },
      setLastUser: (lastUser) => set({ lastUser }),
      setMeAuthData: (data) => set((state) => ({ ...state, ...data })),
      updateUser: (user) => set((state) => ({ user: { ...state.user, ...user } })),
      clearUserStore: () => set({ user: mockUser, lastUser: null, enabledOAuth: [], hasPasskey: false, hasTotp: false }),
    })),
  );
};

// Mock UI Store
export interface MockUIStoreState {
  offlineAccess: boolean;
  toggleOfflineAccess: () => void;
  impersonating: boolean;
  setImpersonating: (status: boolean) => void;
  mode: 'light' | 'dark';
  setMode: (mode: 'light' | 'dark') => void;
  theme: string;
  setTheme: (theme: string) => void;
  clearUIStore: () => void;
}

export const createMockUIStore = () => {
  return create<MockUIStoreState>()(
    devtools((set) => ({
      offlineAccess: false,
      impersonating: false,
      mode: 'light',
      theme: 'none',
      toggleOfflineAccess: () => set((state) => ({ offlineAccess: !state.offlineAccess })),
      setImpersonating: (status) => set({ impersonating: status }),
      setMode: (mode) => set({ mode }),
      setTheme: (theme) => set({ theme }),
      clearUIStore: () => set({ offlineAccess: false, impersonating: false }),
    })),
  );
};

// Mock Sheeter Store
export interface MockSheeterStoreState {
  sheets: Array<{
    id: string;
    content: React.ReactNode;
    open?: boolean;
    key: number;
  }>;
  create: (content: React.ReactNode, data: { id: string; [key: string]: any }) => string;
  update: (id: string, updates: any) => void;
  remove: (id?: string, opts?: { isCleanup?: boolean }) => void;
  get: (id: string) => any;
  triggerRefs: Record<string, any>;
  setTriggerRef: (id: string, ref: any) => void;
  getTriggerRef: (id: string) => any;
}

export const createMockSheeterStore = () => {
  return create<MockSheeterStoreState>()((set, get) => ({
    sheets: [],
    triggerRefs: {},
    create: (content, data) => {
      const sheet = { ...data, content, key: Date.now(), open: true };
      set((state) => ({
        sheets: [...state.sheets.filter((s) => s.id !== data.id), sheet],
      }));
      return data.id;
    },
    update: (id, updates) => {
      set((state) => ({
        sheets: state.sheets.map((sheet) => (sheet.id === id ? { ...sheet, ...updates } : sheet)),
      }));
    },
    remove: (id) => {
      set((state) => ({
        sheets: state.sheets.filter((sheet) => sheet.id !== id),
      }));
    },
    get: (id) => get().sheets.find((sheet) => sheet.id === id),
    setTriggerRef: (id, ref) => {
      set((state) => ({
        triggerRefs: { ...state.triggerRefs, [id]: ref },
      }));
    },
    getTriggerRef: (id) => get().triggerRefs[id] || null,
  }));
};
