import { CheckIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { InputTriggerButton } from '~/modules/common/form-fields/input-trigger-button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger } from '~/modules/ui/select';
import { cn } from '~/utils/cn';

interface ResponsiveSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Language of the label when it differs from the page's, such as a language's own name. */
  lang?: string;
}

const labelOf = (option: ResponsiveSelectOption) => (option.lang ? <span lang={option.lang}>{option.label}</span> : option.label);

const optionRow = (option: ResponsiveSelectOption) => (
  <span className="flex items-center gap-2">
    {option.icon}
    {labelOf(option)}
  </span>
);

interface ResponsiveSelectProps {
  options: ResponsiveSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  /** Shows the title before the value ("Role All"), for a select that stands without a label, as in a filter bar. */
  showTitle?: boolean;
  /** Shows only the selected option's icon; the title names the trigger. */
  iconOnly?: boolean;
  className?: string;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
}

/** A select that opens a popup list from `sm` up and a drawer of options below it. */
export function ResponsiveSelect({
  options,
  value,
  onChange,
  placeholder,
  title,
  showTitle,
  iconOnly,
  className,
  disabled = false,
  align = 'end',
}: ResponsiveSelectProps) {
  const isMobile = useBreakpointBelow('sm');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption ? labelOf(selectedOption) : placeholder;
  const ariaLabel = title ? `${title}: ${selectedOption?.label ?? placeholder}` : undefined;

  // The dimmed title stays above 4.5:1 on a field; the value takes the weight of the buttons beside it.
  const triggerContent =
    showTitle && title ? (
      <span className="flex min-w-0 items-center gap-2">
        <span className="more-contrast:text-muted-foreground more-contrast:opacity-100 opacity-60">{title}</span>
        <span className="truncate font-medium">{selectedLabel}</span>
      </span>
    ) : (
      selectedLabel
    );

  if (isMobile) {
    return (
      <>
        <InputTriggerButton disabled={disabled} className={className} aria-label={ariaLabel} onClick={() => setDrawerOpen(true)}>
          {selectedOption?.icon}
          {!iconOnly && <span className="truncate">{triggerContent}</span>}
        </InputTriggerButton>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            <DrawerHeader className={cn(!title && 'sr-only')}>
              <DrawerTitle>{title ?? placeholder}</DrawerTitle>
            </DrawerHeader>
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
                  {optionRow(option)}
                  {option.value === value && <CheckIcon className="text-success" />}
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
      <SelectTrigger disabled={disabled} className={cn('w-auto', className)} aria-label={ariaLabel}>
        {selectedOption?.icon}
        {!iconOnly && triggerContent}
      </SelectTrigger>
      <SelectContent align={align}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {optionRow(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
