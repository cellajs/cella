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
  /** Language of the label when it differs from the page's, such as a language's own name. */
  lang?: string;
}

const labelOf = (option: ResponsiveSelectOption) => (option.lang ? <span lang={option.lang}>{option.label}</span> : option.label);

interface ResponsiveSelectProps {
  options: ResponsiveSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  /** Shows the title before the value ("Role: All"), for a select that stands without a label, as in a filter bar. */
  showTitle?: boolean;
  className?: string;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
}

/** Select that renders a native dropdown on desktop and a Drawer of options on mobile. */
export function ResponsiveSelect({
  options,
  value,
  onChange,
  placeholder,
  title,
  showTitle,
  className,
  disabled = false,
  align = 'end',
}: ResponsiveSelectProps) {
  const isMobile = useBreakpointBelow('sm');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);
  const prefix = showTitle && title ? <span className="text-muted-foreground">{title}:</span> : null;

  if (isMobile) {
    return (
      <>
        <Button
          type="button"
          variant="input"
          disabled={disabled}
          className={cn('w-auto justify-between gap-2 font-normal', className)}
          aria-label={title ? `${title}: ${selectedOption?.label ?? placeholder}` : undefined}
          onClick={() => setDrawerOpen(true)}
        >
          <span className="truncate text-sm">
            {prefix} {selectedOption ? labelOf(selectedOption) : placeholder}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-70" />
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
                    option.value === value ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                  onClick={() => {
                    onChange(option.value);
                    setDrawerOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    {option.icon}
                    {labelOf(option)}
                  </span>
                  {option.value === value && <CheckIcon strokeWidth={3} className="text-success" />}
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
      <SelectTrigger
        disabled={disabled}
        className={cn('w-auto', className)}
        aria-label={title ? `${title}: ${selectedOption?.label ?? placeholder}` : undefined}
      >
        {selectedOption?.icon}
        {prefix}
        {selectedOption ? labelOf(selectedOption) : placeholder}
      </SelectTrigger>
      <SelectContent align={align}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              {option.icon}
              {labelOf(option)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
