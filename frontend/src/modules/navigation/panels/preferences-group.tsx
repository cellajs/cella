import type { ReactNode } from 'react';
import { NavSheetDivider } from '~/modules/navigation/nav-sheet-divider';
import { Skeleton } from '~/modules/ui/skeleton';
import { Switch } from '~/modules/ui/switch';
import { cn } from '~/utils/cn';

interface PreferencesGroupProps {
  /** A heading for assistive tech only; the panel shows no group titles. */
  title: string;
  children: ReactNode;
}

/** A group of preferences in a nav sheet panel; a hairline sets it apart from the group before it. */
export function PreferencesGroup({ title, children }: PreferencesGroupProps) {
  return (
    <div className="group/preferences flex flex-col gap-4">
      <NavSheetDivider className="mx-0 my-2 group-first/preferences:hidden" />
      <h3 className="sr-only">{title}</h3>
      {children}
    </div>
  );
}

/** A tool's group while its code or data loads, at the offline files group's heights: the panel keeps its height when the tool lands. */
export function PreferencesGroupSkeleton() {
  return (
    <div className="group/preferences flex flex-col gap-4">
      <NavSheetDivider className="mx-0 my-2 group-first/preferences:hidden" />
      <div className="mount-fade grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 duration-300">
        <Skeleton className="size-4 justify-self-center" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-20" />
        {/* my-1 gives the meter line the height of its percent text */}
        <Skeleton className="col-span-2 col-start-2 my-1 h-2 rounded-full" />
      </div>
    </div>
  );
}

interface PreferenceSwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

export function PreferenceSwitch({ id, label, checked, onCheckedChange, className }: PreferenceSwitchProps) {
  return (
    <div className={cn('flex items-center gap-3 px-3', className)}>
      <Switch size="sm" id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      <label htmlFor={id} className="cursor-pointer text-sm leading-4 font-medium select-none">
        {label}
      </label>
    </div>
  );
}
