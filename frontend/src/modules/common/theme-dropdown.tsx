import { config } from 'config';

import { Mode, Theme, useThemeStore } from '~/store/theme';

import { Ban, Circle, LucideProps, Moon, Sun } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

interface ThemeDropdownProps {
  size?: number;
}

const ThemeDropdown = ({ size = 24 }: ThemeDropdownProps) => {
  const { mode, theme, setMode, setTheme } = useThemeStore();

  const modes = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ];

  const themes = [
    { id: 'none', label: 'No color', icon: Ban, color: 'opacity-50' },
    { id: 'rose', label: 'Rose', icon: Circle, color: 'text-rose-600' },
  ];

  function Icon({ icon: Icon }: { icon: React.FC<LucideProps> }) {
    return <Icon size={16} />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change site theme">
          {mode === 'light' ? (
            <Sun size={size} strokeWidth={config.theme.strokeWidth} />
          ) : (
            <Moon size={size} strokeWidth={config.theme.strokeWidth} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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

export default ThemeDropdown;
