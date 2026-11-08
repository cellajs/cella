import { drizzleStudioPort, storybookPort } from 'shared/utils/tool-ports';
import { toggleReactScan, toggleSyncDevtools } from '~/modules/common/devtools/devtools';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

// The library panels open through their own toggle buttons, which tailwind.css hides
const clickHidden = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();

const debugOptions = [
  { id: 'drizzle-studio', icon: '💦', onSelect: () => window.open(`https://local.drizzle.studio?port=${drizzleStudioPort()}`, '_self') },
  { id: 'storybook', icon: '📖', onSelect: () => window.open(`http://localhost:${storybookPort()}/`, '_self') },
  { id: 'tanstack-router', icon: '🌴', onSelect: () => clickHidden('.TanStackRouterDevtools > button') },
  { id: 'react-query', icon: '📡', onSelect: () => clickHidden('.tsqd-parent-container .tsqd-open-btn') },
  { id: 'react-scan', icon: '⏱️', onSelect: toggleReactScan },
  { id: 'sync-devtools', icon: '⚡', onSelect: toggleSyncDevtools },
];

/** 🐞 menu that toggles the panels mounted by `Devtools` and links to local dev tools. */
export function DebugDropdown({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className={cn('size-12 print:hidden', className)} aria-label="toggle debug toolbar" />}>
        🐞
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={24} positionerClassName="z-300" className="w-48">
        {debugOptions.map(({ id, icon, onSelect }) => (
          <DropdownMenuItem key={id} onClick={onSelect}>
            <span>{icon}</span>
            <span>{id}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
