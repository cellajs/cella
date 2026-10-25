import { BanIcon, CircleIcon, MoonIcon, SunIcon } from 'lucide-react';
import { type CSSProperties, useRef } from 'react';
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
  iconStyle?: CSSProperties;
  iconClassName?: string;
  selected: boolean;
  onSelect: () => void;
  separator?: boolean;
}

function ThemeDropdownContent({ items }: { items: ThemeItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div key={item.key}>
          {item.separator && <div className="my-1 in-data-[slot=drawer-row-group]:hidden border-t" />}
          <DropdownSelectItem selected={item.selected} onSelect={item.onSelect}>
            <span className="flex items-center gap-2">
              <span className={item.iconClassName} style={item.iconStyle}>
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

export function UserTheme({ buttonClassName, tooltip = false }: UserThemeProps) {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const modes = [
    { id: 'light', label: t('c:light'), icon: SunIcon },
    { id: 'dark', label: t('c:dark'), icon: MoonIcon },
  ] as const;

  const themes = objectEntries(appConfig.theme.colors) as [keyof typeof appConfig.theme.colors, string][];

  const label = t('c:change_theme');
  const ModeIcon = mode === 'light' ? SunIcon : MoonIcon;

  const openDropdown = () => {
    const { mode: currentMode, theme: currentTheme } = uiStore.getState();

    const items: ThemeItem[] = [
      ...modes.map((option) => ({
        key: option.id,
        label: option.label,
        icon: option.icon,
        selected: currentMode === option.id,
        onSelect: () => {
          setMode(option.id);
          dropdowner.getState().remove();
        },
      })),
      {
        key: 'none',
        label: t('c:without_color'),
        icon: BanIcon,
        iconClassName: 'opacity-50',
        selected: currentTheme === 'none',
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
        selected: currentTheme === name,
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

  return (
    <TooltipButton toolTipContent={label} disabled={!tooltip}>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className={cn('data-dropdowner-active:bg-foreground/8', buttonClassName)}
        aria-label={label}
        onClick={themes.length ? openDropdown : () => setMode(mode === 'light' ? 'dark' : 'light')}
      >
        <ModeIcon className="size-5" />
      </Button>
    </TooltipButton>
  );
}
