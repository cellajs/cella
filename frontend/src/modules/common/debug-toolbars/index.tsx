import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import '~/modules/common/debug-toolbars/style.css';
import { queryClient } from '~/lib/router';

interface DebugItem {
  url?: string;
  id: string;
  icon: string;
  parent?: string;
  element?: string;
}

const debugOptions: DebugItem[] = [
  { id: 'drizzle-studio', icon: '💦', url: 'https://local.drizzle.studio/' },
  { id: 'tanstack-router', icon: '🌴', parent: '.TanStackRouterDevtools', element: ':scope > button' },
  { id: 'react-query', icon: '📡', parent: '.tsqd-parent-container', element: '.tsqd-open-btn' },
];

const DebugToolbars = () => {
  const debugToggle = (item: DebugItem) => {
    if (item.url) return window.open(item.url);
    if (!item.parent || !item.element) return;

    const parent = document.querySelector<HTMLElement>(item.parent);
    if (!parent) return;
    const htmlElement: HTMLButtonElement | null | undefined = parent.querySelector<HTMLButtonElement>(item.element);
    if (!htmlElement) return;
    htmlElement.click();
  };

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
        <DropdownMenuContent side="right" align="end" sideOffset={24} className="w-48 z-300">
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
