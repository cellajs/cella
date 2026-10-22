import { type ReactNode, useState } from 'react';
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
        {description && (
          // The grid row animates from `0fr` to `1fr`, as HelpCollapse does, so the text opens and closes smoothly.
          <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 group-data-[help-open=true]/prefs:grid-rows-[1fr] group-data-[help-open=true]/prefs:opacity-100 motion-reduce:transition-none">
            <p id={descriptionId} className="overflow-hidden text-muted-foreground text-xs">
              <span className="block pt-1">{description}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
