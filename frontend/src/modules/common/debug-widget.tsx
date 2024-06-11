import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from './tooltip-button';
import { Button } from '../ui/button';
import { useThemeStore } from '~/store/theme';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  className?: string;
}

type DebugItem = {
  id: string;
  icon: React.ReactNode;
};

const debugOptions: DebugItem[] = [
  {
    id: 'electric',
    icon: (
      <img
        alt="ElectricSQL"
        src={
          "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20264%20264'%20width='132'%20height='132'%3e%3cpath%20d='M136.992%2053.1244C137.711%2052.4029%20138.683%2052%20139.692%2052H200L114.008%20138.089C113.289%20138.811%20112.317%20139.213%20111.308%20139.213H51L136.992%2053.1244Z'%20fill='%2300D2A0'%20/%3e%3cpath%20d='M126.416%20141.125C126.416%20140.066%20127.275%20139.204%20128.331%20139.204H200L126.416%20213V141.125Z'%20fill='%2300D2A0'%20/%3e%3c/svg%3e"
        }
        className="h-7 w-7"
      />
    ),
  },
  { id: 'tanstack', icon: <img alt="ElectricSQL" src={'https://tanstack.com/_build/assets/logo-color-100w-lPbOTx1K.png'} className="h-7 w-7" /> },
];

const WidgetButton = ({ item, onClick }: { item: DebugItem; onClick: (item: DebugItem) => void }) => {
  const { t } = useTranslation();
  const { theme } = useThemeStore();

  const iconColor = theme !== 'none' ? 'text-primary-foreground' : '';
  return (
    <TooltipButton toolTipContent={t(`common:${item.id}`)} side="top" sideOffset={10} hideWhenDetached>
      <Button variant="ghost" className={`hover:bg-accent/10 group h-14 w-14 ${iconColor}`} onClick={() => onClick(item)}>
        {item.icon}
      </Button>
    </TooltipButton>
  );
};

export const DebugWidget = ({ className = '' }: Props) => {
  const [showDebug, setShowDebug] = useState(window.localStorage.debug === 'true');
  const [debugToolOpen, setDebugToolOpen] = useState(false);

  const closeElectricDevToolsClick = () => {
    const toolbarContainer = document.getElementById('__electric_debug_toolbar_container');
    if (toolbarContainer) {
      const shadowRoot = toolbarContainer.shadowRoot || toolbarContainer.attachShadow({ mode: 'open' });
      const toolbarElement = shadowRoot.getElementById('__electric_debug_toolbar');
      if (toolbarElement) {
        const button = toolbarElement.querySelector('button.rt-Button') as HTMLButtonElement | null;
        toolbarContainer.style.display = 'none';
        if (button) button.click();
        setDebugToolOpen(false);
      }
    }
  };

  const closeTanstackDevToolsClick = () => {
    const tanstackContainer = document.getElementById('TanStackRouterDevTools');
    if (tanstackContainer) {
      const closeButton = tanstackContainer.querySelector('.go2224423957') as HTMLButtonElement | null;
      if (closeButton) closeButton.click();
      setDebugToolOpen(false);
    }
  };
  const debugButtonClick = (item: DebugItem) => {
    //Toggle electric
    if (item.id === 'electric') {
      closeTanstackDevToolsClick();
      const toolbarContainer = document.getElementById('__electric_debug_toolbar_container');
      if (!toolbarContainer) return;

      const shadowRoot = toolbarContainer.shadowRoot || toolbarContainer.attachShadow({ mode: 'open' });
      const toolbarElement = shadowRoot.getElementById('__electric_debug_toolbar');
      if (!toolbarElement) return;

      const header = toolbarElement.querySelector('div.rt-Flex.rt-r-jc-space-between.rt-r-fg-1') as HTMLDivElement | null;
      if (header) {
        toolbarContainer.style.display = '';
        header.style.display = 'none';
      }
      const button = toolbarElement.querySelector('button.rt-Button') as HTMLButtonElement | null;
      if (button && button.textContent?.trim() === 'SHOW') {
        button.click();
        setDebugToolOpen(true);
      }
      if (button && button.textContent?.trim() === 'HIDE') closeElectricDevToolsClick();
      return;
    }
    //Toggle tanStack
    if (item.id === 'tanstack') {
      closeElectricDevToolsClick();
      const tanstackContainer = document.getElementById('TanStackRouterDevTools');
      if (!tanstackContainer) return;
      const openButton = tanstackContainer.querySelector('.go2279492678') as HTMLButtonElement | null;
      if (openButton) {
        openButton.click();
        setDebugToolOpen(true);
      } else {
        closeTanstackDevToolsClick();
      }
      return;
    }
  };

  useEffect(() => {
    const handleStorage = () => {
      setShowDebug(!showDebug);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [showDebug]);

  return (
    <>
      {showDebug && (
        <>
          {debugToolOpen ? (
            <div className="max-xs:bottom-[12px]  fixed right-[8px] bottom-[24px] z-[99999999]">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  closeTanstackDevToolsClick();
                  closeElectricDevToolsClick();
                }}
                aria-label="Close toolbar"
              >
                <X />
              </Button>
            </div>
          ) : (
            <div className={`max-xs:bottom-[68px] right-[12px]  fixed right-[48px] bottom-[24px] z-[99999999] ${className}`}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" aria-label="Debug widget">
                    Debug widget
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48 z-[99999999]">
                  {debugOptions.map((item) => (
                    <WidgetButton key={item.id} item={item} onClick={debugButtonClick} />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </>
      )}
    </>
  );
};
