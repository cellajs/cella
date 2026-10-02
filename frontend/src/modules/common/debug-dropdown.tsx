import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import { create } from 'zustand';
import { SyncDevtools } from '~/modules/common/devtools';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { queryClient } from '~/query/query-client';
import { router } from '~/routes/router';
import { cn } from '~/utils/cn';

interface DebugDropdownProps {
  className?: string;
}

// Drizzle Studio port is derived from the backend port + 983 (see backend/scripts/drizzle-studio/port.ts).
const drizzleStudioPort = Number(new URL(appConfig.backendUrl).port) + 983;
const drizzleStudioUrl = `https://local.drizzle.studio?port=${drizzleStudioPort}`;

const reactScanKey = 'react-scan-enabled';

const useSyncDevtoolsStore = create<{ open: boolean }>(() => ({ open: false }));

/** Imported on demand so react-scan and its bundled Preact stay out of the eager chunk graph. */
const runScan = async (enabled: boolean) => {
  const { scan } = await import('react-scan');
  scan({ showToolbar: enabled, enabled });
};

// The library panels open through their own toggle buttons, which tailwind.css hides
const clickHidden = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();

const debugOptions = [
  { id: 'drizzle-studio', icon: '💦', onSelect: () => window.open(drizzleStudioUrl, '_self') },
  { id: 'storybook', icon: '📖', onSelect: () => window.open('http://localhost:6006/', '_self') },
  { id: 'tanstack-router', icon: '🌴', onSelect: () => clickHidden('.TanStackRouterDevtools > button') },
  { id: 'react-query', icon: '📡', onSelect: () => clickHidden('.tsqd-parent-container .tsqd-open-btn') },
  {
    id: 'react-scan',
    icon: '⏱️',
    onSelect: () => {
      const enable = localStorage.getItem(reactScanKey) !== 'true';
      localStorage.setItem(reactScanKey, String(enable));
      void runScan(enable);
    },
  },
  { id: 'sync-devtools', icon: '⚡', onSelect: () => useSyncDevtoolsStore.setState((state) => ({ open: !state.open })) },
];

/**
 * Devtools panels, mounted once at the root. Inside a sheet, the drawer's transform would contain their
 * fixed-position panels and add blank scroll to it.
 */
function Devtools() {
  const syncDevtoolsOpen = useSyncDevtoolsStore((state) => state.open);

  useEffect(() => {
    if (localStorage.getItem(reactScanKey) === 'true') void runScan(true);
  }, []);

  return (
    <>
      <TanStackRouterDevtools router={router} />
      <ReactQueryDevtools client={queryClient} />
      {syncDevtoolsOpen && <SyncDevtools onClose={() => useSyncDevtoolsStore.setState({ open: false })} />}
    </>
  );
}

/** 🐞 menu that toggles the panels mounted by `Devtools` and links to local dev tools. */
function DebugDropdown({ className }: DebugDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className={cn('size-12', className)} aria-label="toggle debug toolbar" />}>
        🐞
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={24} positionerClassName="z-300" className="w-48 p-1">
        {debugOptions.map(({ id, icon, onSelect }) => (
          <DropdownMenuItem key={id} onClick={onSelect}>
            <span className="mr-2">{icon}</span>
            <span>{id}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { DebugDropdown, Devtools };
