import { Fragment, type ReactNode, useState } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { InputTriggerButton } from '~/modules/common/form-fields/input-trigger-button';
import { groupRuns, SelectDrawer } from '~/modules/common/form-fields/select-drawer';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '~/modules/ui/select';
import { cn } from '~/utils/cn';

interface ResponsiveSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Language of the label when it differs from the page's, such as a language's own name. */
  lang?: string;
  /** What choosing the option would show, such as the rows a filter keeps; right-aligned after the label. */
  count?: number;
  /** Heading of the option's group; consecutive options with one heading form a group. */
  group?: string;
}

const labelOf = (option: ResponsiveSelectOption) => (option.lang ? <span lang={option.lang}>{option.label}</span> : option.label);

const optionRow = (option: ResponsiveSelectOption) => (
  <span className="flex items-center gap-2">
    {option.icon}
    {labelOf(option)}
    {option.count !== undefined && <span className="text-faint-foreground text-xs tabular-nums">{option.count}</span>}
  </span>
);

// The label keys typeahead, so a count never takes part
const selectItem = (option: ResponsiveSelectOption) => (
  <SelectItem key={option.value} value={option.value} label={option.label}>
    {optionRow(option)}
  </SelectItem>
);

interface ResponsiveSelectProps {
  options: ResponsiveSelectOption[];
  /** Undefined selects nothing: the trigger shows the placeholder. */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Names a select that no form label names: its drawer heading and accessible name. Its value takes the weight of the buttons beside it. */
  title?: string;
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
  iconOnly,
  className,
  disabled = false,
  align = 'end',
}: ResponsiveSelectProps) {
  const isMobile = useBreakpointBelow('sm');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);
  const ariaLabel = title && selectedOption ? `${title}: ${selectedOption.label}` : title;

  const triggerContent = selectedOption ? <span className={cn('truncate', title && 'font-medium')}>{labelOf(selectedOption)}</span> : placeholder;

  if (isMobile) {
    return (
      <>
        <InputTriggerButton disabled={disabled} className={className} aria-label={ariaLabel} onClick={() => setDrawerOpen(true)}>
          {selectedOption?.icon}
          {!iconOnly && <span className="truncate">{triggerContent}</span>}
        </InputTriggerButton>

        <SelectDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title={title ?? placeholder}
          titleHidden={!title}
          options={options.map((option) => ({ value: option.value, label: optionRow(option), group: option.group }))}
          value={value}
          onSelect={(next) => {
            onChange(next);
            setDrawerOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <Select value={value ?? null} onValueChange={onChange}>
      <SelectTrigger disabled={disabled} className={cn('w-auto', className)} aria-label={ariaLabel}>
        {selectedOption?.icon}
        {!iconOnly && triggerContent}
      </SelectTrigger>
      <SelectContent align={align} className="min-w-52">
        {groupRuns(options).map((run) =>
          run.group === undefined ? (
            <Fragment key={run.options[0].value}>{run.options.map(selectItem)}</Fragment>
          ) : (
            <SelectGroup key={run.group}>
              <SelectLabel>{run.group}</SelectLabel>
              {run.options.map(selectItem)}
            </SelectGroup>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
