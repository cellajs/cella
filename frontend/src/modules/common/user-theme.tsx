import { config } from 'config';

import { useThemeStore } from '~/store/theme';

import { Ban, Circle, type LucideProps, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { Switch } from '~/modules/ui/switch';
import { objectEntries } from '~/utils/object';
import { cn } from '~/utils/utils';

interface UserThemeProps {
  size?: number;
  className?: string;
}

const UserTheme = ({ size = 24, className = '' }: UserThemeProps) => {
  const { t } = useTranslation();
  const { mode, theme, setMode, setTheme } = useThemeStore();

  const modes = [
    { id: 'light', label: t('common:light'), icon: Sun },
    { id: 'dark', label: t('common:dark'), icon: Moon },
  ] as const;
  const themes = objectEntries(config.theme.colors);

  function Icon({ icon: Icon }: { icon: React.FC<LucideProps> }) {
    return <Icon size={16} />;
  }

  if (!themes.length)
    return (
      <Switch
        size="sm"
        id="changeTheme"
        className={cn(mode === 'light' && '!bg-border/50', 'scale-125 m-2', className)}
        checked={mode === 'light'}
        onCheckedChange={() => setMode(mode === 'light' ? 'dark' : 'light')}
        aria-label={'changeTheme'}
        thumb={
          mode === 'light' ? <Sun size={size} strokeWidth={config.theme.strokeWidth} /> : <Moon size={size} strokeWidth={config.theme.strokeWidth} />
        }
      />
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="Change theme">
          {mode === 'light' ? (
            <Sun size={size} strokeWidth={config.theme.strokeWidth} />
          ) : (
            <Moon size={size} strokeWidth={config.theme.strokeWidth} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="end">
        {modes.map((item) => (
          <DropdownMenuCheckboxItem key={item.id} checked={mode === item.id} onCheckedChange={() => setMode(item.id)}>
            <Icon icon={item.icon} />
            <span className="ml-2">{item.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem key={'none'} checked={theme === 'none'} onCheckedChange={() => setTheme('none')}>
          <span className={'opacity-50'}>
            <Icon icon={Ban} />
          </span>
          <span className="ml-2">{t('common:without_color')}</span>
        </DropdownMenuCheckboxItem>
        {themes.map(([name, color]) => (
          <DropdownMenuCheckboxItem key={name} checked={theme === name} onCheckedChange={() => setTheme(name)}>
            <span style={{ color }}>
              <Icon icon={Circle} />
            </span>
            <span className="ml-2">{(name as string)[0].toUpperCase() + (name as string).slice(1)}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserTheme;
