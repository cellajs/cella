import { BanIcon, CheckIcon, CircleIcon, type LucideIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';
import { objectEntries } from '~/utils/object-entries';

function Icon({ icon: IconEl, size = 20 }: { icon: LucideIcon; size?: number }) {
  return <IconEl size={size} strokeWidth={appConfig.theme.strokeWidth} />;
}

interface ThemeItem {
  key: string;
  label: string;
  icon: LucideIcon;
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
          <DropdownActionItem
            isMobile={isMobile}
            variant="ghost"
            className="w-full justify-between gap-4"
            onSelect={item.onSelect}
          >
            <span className="flex items-center gap-2">
              <span className={item.iconClass} style={item.iconStyle}>
                <Icon size={16} icon={item.icon} />
              </span>
              {item.label}
            </span>
            <CheckIcon className={`text-success ${item.checked ? 'visible' : 'invisible'}`} />
          </DropdownActionItem>
        </div>
      ))}
    </div>
  );
}

interface UserThemeProps {
  size?: number;
  buttonClassName?: string;
}

/**
 * Component to switch between light/dark modes and optionally select color themes.
 * Renders a dropdown menu with available themes or a switch if only one theme is available.
 */
export function UserTheme({ buttonClassName = '' }: UserThemeProps) {
  const { t } = useTranslation();
  const { mode, setMode, setTheme } = useUIStore();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const modes = [
    { id: 'light', label: t('c:light'), icon: SunIcon },
    { id: 'dark', label: t('c:dark'), icon: MoonIcon },
  ] as const;

  const themes = objectEntries(appConfig.theme.colors) as [keyof typeof appConfig.theme.colors, string][];

  // if just one theme, use toggle button
  if (!themes.length) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={buttonClassName}
        aria-label="changeTheme"
        onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
      >
        <Icon icon={mode === 'light' ? SunIcon : MoonIcon} />
      </Button>
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

  // Else use dropdowner (dropdown on desktop, drawer on mobile)
  return (
    <Button
      ref={triggerRef}
      variant="ghost"
      size="icon"
      className={cn('data-dropdowner-active:bg-accent', buttonClassName)}
      aria-label="Change theme"
      onClick={openDropdown}
    >
      <Icon icon={mode === 'light' ? SunIcon : MoonIcon} />
    </Button>
  );
}
