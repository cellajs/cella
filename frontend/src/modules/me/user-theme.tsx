import { BanIcon, CircleIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { DropdownSelectItem } from '~/modules/common/dropdowner/dropdown-select-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { uiStore, useUIStore } from '~/modules/ui/ui-store';
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

function ThemeDropdownContent({ items }: { items: ThemeItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div key={item.key}>
          {item.separator && <div className="my-1 border-t" />}
          <DropdownSelectItem selected={item.checked} onSelect={item.onSelect}>
            <span className="flex items-center gap-2">
              <span className={item.iconClass} style={item.iconStyle}>
                <item.icon />
              </span>
              {item.label}
            </span>
          </DropdownSelectItem>
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
    const { mode: currentMode, theme: currentTheme } = uiStore.getState();

    const items: ThemeItem[] = [
      ...modes.map((m) => ({
        key: m.id,
        label: m.label,
        icon: m.icon,
        checked: currentMode === m.id,
        onSelect: () => {
          setMode(m.id);
          dropdowner.getState().remove();
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
          dropdowner.getState().remove();
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
          dropdowner.getState().remove();
        },
      })),
    ];

    dropdowner.getState().create(<ThemeDropdownContent items={items} />, {
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
