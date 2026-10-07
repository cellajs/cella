import { BanIcon, CheckIcon, CircleIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';
import { objectEntries } from '~/utils/object-entries';

interface ThemeItem {
  key: string;
  label: string;
  icon: IconComponent;
  iconStyle?: React.CSSProperties;
  iconClass?: string;
  checked: boolean;
  onSelect: () => void;
  separator?: boolean;
}

function ThemeDropdownContent({ items, isMobile }: { items: ThemeItem[]; isMobile: boolean }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div key={item.key}>
          {item.separator && <div className="my-1 border-t" />}
          <DropdownActionItem isMobile={isMobile} variant="ghost" className="w-full justify-between gap-4" onSelect={item.onSelect}>
            <span className="flex items-center gap-2">
              <span className={item.iconClass} style={item.iconStyle}>
                <item.icon />
              </span>
              {item.label}
            </span>
            <CheckIcon className={cn('text-success', item.checked ? 'visible' : 'invisible')} />
          </DropdownActionItem>
        </div>
      ))}
    </div>
  );
}

interface UserThemeProps {
  buttonClassName?: string;
  /** Names the button in a tooltip below it. */
  tooltip?: boolean;
}

export function UserTheme({ buttonClassName = '', tooltip = false }: UserThemeProps) {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const modes = [
    { id: 'light', label: t('c:light'), icon: SunIcon },
    { id: 'dark', label: t('c:dark'), icon: MoonIcon },
  ] as const;

  const themes = objectEntries(appConfig.theme.colors) as [keyof typeof appConfig.theme.colors, string][];

  const label = t('c:change_theme');
  const withTooltip = (button: React.ComponentProps<typeof TooltipButton>['children']) => (
    <TooltipButton toolTipContent={label} disabled={!tooltip}>
      {button}
    </TooltipButton>
  );

  if (!themes.length) {
    return withTooltip(
      <Button variant="ghost" size="icon" className={buttonClassName} aria-label={label} onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}>
        {mode === 'light' ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
      </Button>,
    );
  }

  const openDropdown = () => {
    const { mode: currentMode, theme: currentTheme } = useUIStore.getState();
    const isMobile = window.innerWidth < 640;

    const items: ThemeItem[] = [
      ...modes.map((m) => ({
        key: m.id,
        label: m.label,
        icon: m.icon,
        checked: currentMode === m.id,
        onSelect: () => {
          setMode(m.id);
          useDropdowner.getState().remove();
        },
      })),
      {
        key: 'none',
        label: t('c:without_color'),
        icon: BanIcon,
        iconClass: 'opacity-50',
        checked: currentTheme === 'none',
        onSelect: () => {
          setTheme('none');
          useDropdowner.getState().remove();
        },
        separator: true,
      },
      ...themes.map(([name, color]) => ({
        key: name,
        label: (name as string)[0].toUpperCase() + (name as string).slice(1),
        icon: CircleIcon,
        iconStyle: { color },
        checked: currentTheme === name,
        onSelect: () => {
          setTheme(name);
          useDropdowner.getState().remove();
        },
      })),
    ];

    useDropdowner.getState().create(<ThemeDropdownContent items={items} isMobile={isMobile} />, {
      id: 'user-theme',
      triggerId: 'user-theme-trigger',
      triggerRef,
      kind: 'menu',
    });
  };

  return withTooltip(
    <Button
      ref={triggerRef}
      variant="ghost"
      size="icon"
      className={cn('data-dropdowner-active:bg-foreground/8', buttonClassName)}
      aria-label={label}
      onClick={openDropdown}
    >
      {mode === 'light' ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </Button>,
  );
}
