import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import useMounted from '~/hooks/use-mounted';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { Button } from '../../ui/button';
import './style.css';
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
  { id: 'electric-sql', icon: '⚡', parent: '#__electric_debug_toolbar_container', element: '.rt-reset.rt-BaseButton' },
  { id: 'tanstack-router', icon: '🌴', parent: '.TanStackRouterDevtools', element: ':scope > button' },
  { id: 'react-query', icon: '📡', parent: '.tsqd-parent-container', element: '.tsqd-open-btn' },
];

const DebugToolbars = () => {
  const { hasStarted } = useMounted();

  const debugToggle = (item: DebugItem) => {
    if (item.url) return window.open(item.url);
    if (!item.parent || !item.element) return;

    const parent = document.querySelector<HTMLElement>(item.parent);
    if (!parent) return;
    let htmlElement: HTMLButtonElement | null | undefined = parent.querySelector<HTMLButtonElement>(item.element);
    if (item.id === 'electric-sql') htmlElement = parent.shadowRoot?.querySelector<HTMLButtonElement>(item.element);
    if (!htmlElement) return;

    if (item.id === 'electric-sql') parent.classList.remove('hidden');
    htmlElement.click();
  };

  return (
    <>
      <TanStackRouterDevtools />
      <ReactQueryDevtools client={queryClient} />
      <div
        className={`max-sm:hidden left-3 bottom-3 fixed z-[99] transition-transform ease-out'
          ${!hasStarted && 'sm:-translate-x-full'}`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="toggle debug toolbar">
              🐞
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={24} className="w-48 z-[300]">
            {debugOptions.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => debugToggle(item)}>
                <span className="mr-2">{item.icon}</span>
                <span>{item.id}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};

export default DebugToolbars;
