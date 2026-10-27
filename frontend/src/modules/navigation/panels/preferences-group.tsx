import { type ReactNode, useId, useState } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { PanelHeading } from '~/modules/navigation/panels/panel-heading';
import { HelpToggle } from '~/modules/ui/help-toggle';
import { Switch } from '~/modules/ui/switch';
import { cn } from '~/utils/cn';

interface PreferencesGroupProps {
  title: string;
  /** Shows the help toggle, for a group whose switches carry a description. */
  help?: boolean;
  className?: string;
  children: ReactNode;
}

/** A titled group of preference switches; its help toggle opens every switch description in the group at once. */
export function PreferencesGroup({ title, help, className, children }: PreferencesGroupProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div data-help-open={helpOpen} className={cn('group/prefs flex flex-col gap-4', className)}>
      <div className="flex items-center gap-2 px-3">
        <PanelHeading>{title}</PanelHeading>
        {help && <HelpToggle open={helpOpen} onToggle={() => setHelpOpen((prev) => !prev)} className="-my-1" />}
      </div>
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

/** A labelled switch whose description follows its group's help toggle through `group/prefs`, so the row holds no help state. */
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
        <label htmlFor={id} className="cursor-pointer select-none text-sm leading-4">
          {label}
        </label>
        {description && <PreferenceDescription id={descriptionId}>{description}</PreferenceDescription>}
      </div>
    </div>
  );
}

interface PreferenceRowProps {
  icon: IconComponent;
  label: string;
  description?: string;
  /** Controls at the row's end, such as a value and a button that opens a dialog. */
  children: ReactNode;
}

/**
 * A labelled row whose icon takes the switch column, so its label lines up with the switches. Its controls sit at the
 * end of the label line, and its description runs below both.
 */
export function PreferenceRow({ icon: Icon, label, description, children }: PreferenceRowProps) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <fieldset
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 px-3"
    >
      <span className="flex justify-center text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span id={labelId} className="text-sm leading-4">
        {label}
      </span>
      {/* -my-2 centers controls up to h-8 on the label line, so the row keeps the height of a switch row */}
      <div className="-my-2 flex items-center gap-2">{children}</div>
      {description && (
        <PreferenceDescription id={descriptionId} className="col-span-2 col-start-2">
          {description}
        </PreferenceDescription>
      )}
    </fieldset>
  );
}

/** Opens and closes with its group's help toggle through `group/prefs`. */
function PreferenceDescription({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    // The grid row animates from `0fr` to `1fr`, as HelpCollapse does, so the text opens and closes smoothly.
    <div
      className={cn(
        'grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 group-data-[help-open=true]/prefs:grid-rows-[1fr] group-data-[help-open=true]/prefs:opacity-100 motion-reduce:transition-none',
        className,
      )}
    >
      <p id={id} className="overflow-hidden text-muted-foreground text-xs">
        <span className="block pt-1">{children}</span>
      </p>
    </div>
  );
}
