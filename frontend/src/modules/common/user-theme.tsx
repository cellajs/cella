import { config } from 'config';

import { type Mode, type Theme, useThemeStore } from '~/store/theme';

import { Ban, Circle, type LucideProps, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

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
  ];
  const themes: [string, string][] = Object.entries(config.theme.colors);

  function Icon({ icon: Icon }: { icon: React.FC<LucideProps> }) {
    return <Icon size={16} />;
  }

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
          <DropdownMenuCheckboxItem key={item.id} checked={mode === item.id} onCheckedChange={() => setMode(item.id as Mode)}>
            <Icon icon={item.icon} />
            <span className="ml-2">{item.label}</span>
          </DropdownMenuCheckboxItem>
        ))}

        {themes.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem key={'none'} checked={theme === 'none'} onCheckedChange={() => setTheme('none')}>
              <span className={'opacity-50'}>
                <Icon icon={Ban} />
              </span>
              <span className="ml-2">{t('common:without_color')}</span>
            </DropdownMenuCheckboxItem>
            {themes.map(([name, color]) => (
              <DropdownMenuCheckboxItem key={name} checked={theme === name} onCheckedChange={() => setTheme(name as Theme)}>
                <span style={{ color }}>
                  <Icon icon={Circle} />
                </span>
                <span className="ml-2">{name[0].toUpperCase() + name.slice(1)}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserTheme;
