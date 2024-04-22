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

  const themes = [
    { id: 'none', label: t('common:no_color'), icon: Ban, color: 'opacity-50' },
    { id: 'rose', label: 'Rose', icon: Circle, color: 'text-rose-600' },
  ];

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

        <DropdownMenuSeparator />
        {themes.map((item) => (
          <DropdownMenuCheckboxItem key={item.id} checked={theme === item.id} onCheckedChange={() => setTheme(item.id as Theme)}>
            <span className={item.color ? item.color : ''}>
              <Icon icon={item.icon} />
            </span>
            <span className="ml-2">{item.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserTheme;
