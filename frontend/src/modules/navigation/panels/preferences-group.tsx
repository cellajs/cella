import type { ReactNode } from 'react';
import { menuHairlineClass } from '~/modules/navigation/menu-sheet/helpers/menu-columns';
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
      <div aria-hidden className={cn(menuHairlineClass, 'mx-0 my-2 group-first/preferences:hidden')} />
      <h3 className="sr-only">{title}</h3>
      {children}
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
