import { appConfig } from 'config';
import { BanIcon, CircleIcon, type LucideProps, MoonIcon, SunIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';
import { Switch } from '~/modules/ui/switch';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';
import { objectEntries } from '~/utils/object';

interface UserThemeProps {
  size?: number;
  buttonClassName?: string;
  contentClassName?: string;
}

/**
 * Component to switch between light/dark modes and optionally select color themes.
 * Renders a dropdown menu with available themes or a switch if only one theme is available.
 */
function UserTheme({ size = 20, buttonClassName = '', contentClassName = '' }: UserThemeProps) {
  const { t } = useTranslation();
  const { mode, theme, setMode, setTheme } = useUIStore();

  const modes = [
    { id: 'light', label: t('common:light'), icon: SunIcon },
    { id: 'dark', label: t('common:dark'), icon: MoonIcon },
  ] as const;

  const themes = objectEntries(appConfig.theme.colors) as [keyof typeof appConfig.theme.colors, string][];

  function Icon({ icon: Icon }: { icon: React.ElementType<LucideProps> }) {
    return <Icon size={size} strokeWidth={appConfig.theme.strokeWidth} />;
  }

  // if just one theme, use switch
  if (!themes.length) {
    return (
      <Switch
        id="changeTheme"
        className={cn(mode === 'light' && 'bg-border/50!', 'scale-125 m-2', buttonClassName)}
        checked={mode === 'light'}
        onCheckedChange={() => setMode(mode === 'light' ? 'dark' : 'light')}
        aria-label={'changeTheme'}
        thumb={
          mode === 'light' ? (
            <SunIcon size={size} strokeWidth={appConfig.theme.strokeWidth} />
          ) : (
            <MoonIcon size={size} strokeWidth={appConfig.theme.strokeWidth} />
          )
        }
      />
    );
  }

  // Else use a dropdown menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={buttonClassName} aria-label="Change theme">
          <Icon icon={mode === 'light' ? SunIcon : MoonIcon} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn('w-48 p-1', contentClassName)} align="end">
        {modes.map((item) => (
          <DropdownMenuCheckboxItem key={item.id} checked={mode === item.id} onCheckedChange={() => setMode(item.id)}>
            <Icon icon={item.icon} />
            <span className="ml-2">{item.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem key={'none'} checked={theme === 'none'} onCheckedChange={() => setTheme('none')}>
          <span className={'opacity-50'}>
            <Icon icon={BanIcon} />
          </span>
          <span className="ml-2">{t('common:without_color')}</span>
        </DropdownMenuCheckboxItem>
        {themes.map(([name, color]) => (
          <DropdownMenuCheckboxItem key={name} checked={theme === name} onCheckedChange={() => setTheme(name)}>
            <span style={{ color }}>
              <Icon icon={CircleIcon} />
            </span>
            <span className="ml-2">{(name as string)[0].toUpperCase() + (name as string).slice(1)}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserTheme;
