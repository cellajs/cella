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
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

/** A labelled switch whose description follows the panel's help toggle through `group/help`, so the row holds no help state. */
export function PreferenceSwitch({ id, label, description, checked, onCheckedChange, className }: PreferenceSwitchProps) {
  const descriptionId = `${id}-description`;

  return (
    <div className={cn('flex items-start gap-3 px-3', className)}>
      <Switch
        size="sm"
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
      />
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className="cursor-pointer select-none font-medium text-sm leading-4">
          {label}
        </label>
        {description && <PreferenceDescription id={descriptionId}>{description}</PreferenceDescription>}
      </div>
    </div>
  );
}

/** Opens and closes with the panel's help toggle through `group/help`. */
export function PreferenceDescription({ id, children }: { id: string; children: ReactNode }) {
  return (
    // The grid row animates from `0fr` to `1fr`, as HelpCollapse does, so the text opens and closes smoothly.
    <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 group-data-[help-open=true]/help:grid-rows-[1fr] group-data-[help-open=true]/help:opacity-100 motion-reduce:transition-none">
      <p id={id} className="overflow-hidden text-muted-foreground text-sm">
        <span className="block pt-1">{children}</span>
      </p>
    </div>
  );
}
