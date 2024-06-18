import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { Button } from '../../ui/button';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import './style.css';

interface DebugItem {
  id: string;
  icon: string;
  parent: string;
  element: string;
}

const debugOptions: DebugItem[] = [
  { id: 'electric-sql', icon: '⚡', parent: '#__electric_debug_toolbar_container', element: '.rt-reset.rt-BaseButton' },
  { id: 'tanstack-router', icon: '🌴', parent: '.TanStackRouterDevtools', element: ':scope > button' },
  { id: 'react-query', icon: '📡', parent: '.tsqd-parent-container', element: '.tsqd-open-btn' },
];

const DebugToolbars = () => {
  const debugToggle = (id: string) => {
    const item = debugOptions.find((option) => option.id === id);
    if (!item) return;

    const parent = document.querySelector<HTMLElement>(item.parent);
    if (!parent) return;

    let htmlElement: HTMLButtonElement | null | undefined = parent.querySelector<HTMLButtonElement>(item.element);
    if (id === 'electric-sql') htmlElement = parent.shadowRoot?.querySelector<HTMLButtonElement>(item.element);
    if (!htmlElement) return;

    if (id === 'electric-sql') parent.classList.remove('hidden');
    htmlElement.click();
  };

  return (
    <>
      <TanStackRouterDevtools />
      <ReactQueryDevtools />

      <div className="max-sm:hidden left-3 fixed bottom-3 z-[9999]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="toggle debug toolbar">
              🐞
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={24} className="w-48 z-[99999999]">
            {debugOptions.map(({ id, icon }) => (
              <DropdownMenuItem key={id} onClick={() => debugToggle(id)}>
                <span className="mr-2">{icon}</span>
                <span>{id}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};

export default DebugToolbars;
