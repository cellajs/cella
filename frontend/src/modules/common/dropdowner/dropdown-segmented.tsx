import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { SegmentedControl, SegmentedControlItem, SegmentedMenuGroup, SegmentedMenuItem } from '~/modules/ui/segmented-control';

interface DropdownSegmentedProps<Value extends string> {
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  options: readonly { value: Value; label: string }[];
}

/** One choice among a few short options on one line that keeps its menu open: menu rows in the popup, a radio group in the drawer. */
export function DropdownSegmented<Value extends string>({ label, value, onChange, options }: DropdownSegmentedProps<Value>) {
  const inDrawer = useInDropdownerDrawer();

  if (inDrawer) {
    return (
      <div className="px-4.5 pb-2">
        <SegmentedControl<Value> size="sm" className="w-full" aria-label={label} value={value} onValueChange={onChange}>
          {options.map((option) => (
            <SegmentedControlItem key={option.value} value={option.value} className="flex-1">
              {option.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>
    );
  }

  return (
    <div className="px-2 pb-1">
      <SegmentedMenuGroup size="sm" className="w-full" aria-label={label} value={value} onValueChange={onChange}>
        {options.map((option) => (
          <SegmentedMenuItem key={option.value} value={option.value} className="flex-1">
            {option.label}
          </SegmentedMenuItem>
        ))}
      </SegmentedMenuGroup>
    </div>
  );
}
