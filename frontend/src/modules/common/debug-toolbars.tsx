import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';
import { scan } from 'react-scan';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { queryClient } from '~/query/query-client';

interface DebugItem {
  url?: string;
  id: string;
  icon: string;
  parent?: string;
  element?: string;
}

const debugOptions: DebugItem[] = [
  { id: 'drizzle-studio', icon: '💦', url: 'https://local.drizzle.studio/' },
  { id: 'docs', icon: '🧑‍💻', url: 'http://localhost:4000/docs' },
  { id: 'storybook', icon: '📖', url: 'http://localhost:6006/' },
  { id: 'tanstack-router', icon: '🌴', parent: '.TanStackRouterDevtools', element: ':scope > button' },
  { id: 'react-query', icon: '📡', parent: '.tsqd-parent-container', element: '.tsqd-open-btn' },
  { id: 'react-scan', icon: '⏱️' },
];

const DebugToolbars = () => {
  // Function to handle toggling debug options in different ways
  const debugToggle = (item: DebugItem) => {
    if (item.url) return window.open(item.url);

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="w-12 h-12" aria-label="toggle debug toolbar">
            🐞
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" sideOffset={24} className="p-1 w-48 z-300">
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
};

export default DebugToolbars;
