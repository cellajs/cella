import { BanIcon, CheckIcon, CircleIcon, type LucideProps, MoonIcon, SunIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Button } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';
import { objectEntries } from '~/utils/object';

function Icon({ icon: IconEl, size = 20 }: { icon: React.ElementType<LucideProps>; size?: number }) {
  return <IconEl size={size} strokeWidth={appConfig.theme.strokeWidth} />;
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
    { id: 'light', label: t('common:light'), icon: SunIcon },
    { id: 'dark', label: t('common:dark'), icon: MoonIcon },
  ] as const;

  const themes = objectEntries(appConfig.theme.colors) as [keyof typeof appConfig.theme.colors, string][];

  // if just one theme, use switch
  if (!themes.length) {
    return (
      <Switch
        id="changeTheme"
        className={cn(mode === 'light' && 'bg-border/50!', 'scale-125', buttonClassName)}
        checked={mode === 'light'}
        onCheckedChange={() => setMode(mode === 'light' ? 'dark' : 'light')}
        aria-label={'changeTheme'}
        thumb={
          mode === 'light' ? (
            <SunIcon size={16} strokeWidth={appConfig.theme.strokeWidth} />
          ) : (
            <MoonIcon size={16} strokeWidth={appConfig.theme.strokeWidth} />
          )
        }
      />
    );
  }

  const openDropdown = () => {
    const { mode: currentMode, theme: currentTheme } = useUIStore.getState();

    const items: {
      key: string;
      label: string;
      icon: React.ElementType<LucideProps>;
      iconStyle?: React.CSSProperties;
      iconClass?: string;
      checked: boolean;
      onSelect: () => void;
      separator?: boolean;
    }[] = [
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
        label: t('common:without_color'),
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

    useDropdowner.getState().create(
      <div className="flex flex-col">
        {items.map((item) => (
          <div key={item.key}>
            {item.separator && <div className="border-t my-1" />}
            <Button variant="ghost" className="w-full justify-between gap-4" onClick={item.onSelect}>
              <span className="flex items-center gap-2">
                <span className={item.iconClass} style={item.iconStyle}>
                  <Icon size={16} icon={item.icon} />
                </span>
                {item.label}
              </span>
              <CheckIcon size={16} className={`text-success ${item.checked ? 'visible' : 'invisible'}`} />
            </Button>
          </div>
        ))}
      </div>,
      {
        id: 'user-theme',
        triggerId: 'user-theme-trigger',
        triggerRef,
      },
    );
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
