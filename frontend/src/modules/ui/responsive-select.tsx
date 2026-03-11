import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { Button } from '~/modules/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger } from '~/modules/ui/select';
import { cn } from '~/utils/cn';

interface ResponsiveSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface ResponsiveSelectProps {
  options: ResponsiveSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
}

/**
 * A select component that renders a native Select dropdown on desktop
 * and a Drawer with selectable options on mobile for better touch UX.
 */
export function ResponsiveSelect({
  options,
  value,
  onChange,
  placeholder,
  title,
  className,
  disabled = false,
  align = 'end',
}: ResponsiveSelectProps) {
  const isMobile = useBreakpointBelow('sm');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);

  if (isMobile) {
    return (
      <>
        <Button
          variant="input"
          disabled={disabled}
          className={cn('w-auto justify-between gap-2 font-normal', className)}
          onClick={() => setDrawerOpen(true)}
        >
          <span className="truncate text-sm">{selectedOption?.label ?? placeholder}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            {title && (
              <DrawerHeader>
                <DrawerTitle>{title}</DrawerTitle>
              </DrawerHeader>
            )}
            <div className="flex flex-col gap-0.5 p-2 pb-6">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition-colors',
                    option.value === value ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-accent/50',
                  )}
                  onClick={() => {
                    onChange(option.value);
                    setDrawerOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    {option.icon}
                    {option.label}
                  </span>
                  {option.value === value && <CheckIcon size={16} strokeWidth={3} className="text-success" />}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger disabled={disabled} className={cn('w-auto', className)}>
        {selectedOption?.icon}
        {selectedOption?.label ?? placeholder}
      </SelectTrigger>
      <SelectContent align={align}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
