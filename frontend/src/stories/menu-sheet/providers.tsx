import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appConfig } from 'config';
import { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { UserMenu } from '~/modules/me/types';
import { createMockNavigationStore, createMockSheeterStore, createMockUIStore, createMockUserStore } from '~/stories/menu-sheet/stores';

// Mock i18n
const mockI18n = {
  t: (key: string, options?: any) => {
    const translations: Record<string, string> = {
      'common:organizations': 'Organizations',
      'common:keep_menu_open': 'Keep menu open',
      'common:detailed_menu': 'Detailed menu',
      'common:offline_access': 'Offline access',
      'common:offline_access_on.text': `Offline access enabled for ${appConfig.name}`,
      'common:offline_access_off.text': `Offline access disabled for ${appConfig.name}`,
      'common:placeholder.search': 'Search...',
      'common:no_resource_found': 'No {{resource}} found',
      'common:results': 'results',
      'common:configure_menu.text': 'Drag and drop to reorder your menu items',
      'common:show_archived.offline.text': 'Cannot access archived items while offline',
      'common:success.update_item': '{{item}} updated successfully',
      'common:membership': 'membership',
      'common:admin': 'admin',
      'common:member': 'member',
      'common:organization': 'organization',
    };

    let result = translations[key] || key;

    if (options) {
      Object.entries(options).forEach(([placeholder, value]) => {
        result = result.replace(`{{${placeholder}}}`, String(value));
      });
    }

    return result;
  },
  language: 'en',
  changeLanguage: () => {},
};

// Mock appConfig
const mockAppConfigInstance = {
  ...appConfig,
  has: {
    ...appConfig.has,
    pwa: true,
  },
};

// Mock mutation
const mockMutateAsync = () => Promise.resolve({});

// Mock drag and drop
const mockCombine = () => () => {};
const mockMonitorForElements = () => () => {};
const mockAutoScrollForElements = () => () => {};

// Mock online manager
const mockOnlineManager = {
  isOnline: () => true,
};

// Create mock providers
export const createMockProviders = (initialMenu?: UserMenu) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  const mockNavigationStore = createMockNavigationStore(initialMenu);
  const mockUserStore = createMockUserStore();
  const mockUIStore = createMockUIStore();
  const mockSheeterStore = createMockSheeterStore();

  // Mock the hooks
  const mockHooks = {
    useNavigationStore: mockNavigationStore,
    useUserStore: mockUserStore,
    useUIStore: mockUIStore,
    useSheeter: mockSheeterStore,
    useMemberUpdateMutation: () => ({ mutateAsync: mockMutateAsync }),
    useTranslation: () => ({ t: mockI18n.t }),
  };

  const MockProviders = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={mockI18n as any}>{children}</I18nextProvider>
    </QueryClientProvider>
  );

  return {
    MockProviders,
    mockHooks,
    mockStores: {
      navigation: mockNavigationStore,
      user: mockUserStore,
      ui: mockUIStore,
      sheeter: mockSheeterStore,
    },
    mocks: {
      combine: mockCombine,
      monitorForElements: mockMonitorForElements,
      autoScrollForElements: mockAutoScrollForElements,
      onlineManager: mockOnlineManager,
      appConfig: mockAppConfigInstance,
      mutateAsync: mockMutateAsync,
    },
  };
};
