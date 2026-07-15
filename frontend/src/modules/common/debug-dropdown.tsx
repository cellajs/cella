import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect, useState } from 'react';
import { scan } from 'react-scan';
import { SyncDevtools } from '~/modules/common/devtools';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { queryClient } from '~/query/query-client';
import { cn } from '~/utils/cn';

interface DebugItem {
  url?: string;
  id: string;
  icon: string;
  parent?: string;
  element?: string;
}

interface DebugDropdownProps {
  className?: string;
}

// Backend listens on 4000 in development (backendUrl is the Vite-proxied public URL).
const drizzleStudioPort = 4000 + 983;
const drizzleStudioUrl = `https://local.drizzle.studio?port=${drizzleStudioPort}`;

const debugOptions: DebugItem[] = [
  { id: 'drizzle-studio', icon: '💦', url: drizzleStudioUrl },
  { id: 'storybook', icon: '📖', url: 'http://localhost:6006/' },
  { id: 'tanstack-router', icon: '🌴', parent: '.TanStackRouterDevtools', element: ':scope > button' },
  { id: 'react-query', icon: '📡', parent: '.tsqd-parent-container', element: '.tsqd-open-btn' },
  { id: 'react-scan', icon: '⏱️' },
  { id: 'sync-devtools', icon: '⚡' },
];

function DebugDropdown({ className }: DebugDropdownProps) {
  const [syncDevtoolsOpen, setSyncDevtoolsOpen] = useState(false);

  // Function to handle toggling debug options in different ways
  const debugToggle = (item: DebugItem) => {
    if (item.id === 'sync-devtools') {
      setSyncDevtoolsOpen((prev) => !prev);
      return;
    }

    if (item.url) return window.open(item.url, '_self');

    if (item.id === 'react-scan') {
      const prev = localStorage.getItem('react-scan-enabled') === 'true';
      const enable = !prev;
      localStorage.setItem('react-scan-enabled', JSON.stringify(enable));
      scan({ showToolbar: enable, enabled: enable });
      return;
    }

    if (!item.parent || !item.element) return;

    const parent = document.querySelector<HTMLElement>(item.parent);
    if (!parent) return;

    const htmlElement = parent.querySelector<HTMLButtonElement>(item.element);
    if (!htmlElement) return;

    htmlElement.click();
  };

  // Check if react-scan is enabled
  useEffect(() => {
    const enabled = localStorage.getItem('react-scan-enabled') === 'true';
    if (enabled) {
      scan({ showToolbar: true, enabled: true });
    }
  }, []);

  return (
    <>
      <TanStackRouterDevtools />
      <ReactQueryDevtools client={queryClient} />
      <SyncDevtools isOpen={syncDevtoolsOpen} onClose={() => setSyncDevtoolsOpen(false)} />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className={cn('h-12 w-12', className)} aria-label="toggle debug toolbar" />}
        >
          🐞
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" sideOffset={24} className="z-300 w-48 p-1">
          {debugOptions.map((item) => (
            <DropdownMenuItem key={item.id} onClick={() => debugToggle(item)}>
              <span className="mr-2">{item.icon}</span>
              <span>{item.id}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export { DebugDropdown };
