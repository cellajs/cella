import { ChevronRightIcon } from 'lucide-react';
import { type ReactNode, type Ref, useId, useState } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { PanelHeading } from '~/modules/navigation/panels/panel-heading';
import { Button } from '~/modules/ui/button';
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

interface PreferenceButtonProps {
  icon: IconComponent;
  label: string;
  /** The value at the end of the label line, such as a badge. */
  status?: ReactNode;
  description?: string;
  ref?: Ref<HTMLButtonElement>;
  onClick: () => void;
  /** Detail under the label, such as a meter. */
  children?: ReactNode;
}

/**
 * A button that opens a preference's dialog. Its icon takes the switch column, so its label lines up with the switches,
 * and its description below opens with the group's help toggle.
 */
export function PreferenceButton({ icon: Icon, label, status, description, ref, onClick, children }: PreferenceButtonProps) {
  const descriptionId = useId();

  return (
    <div className="flex flex-col">
      <Button
        ref={ref}
        variant="outline"
        size="auto"
        aria-haspopup="dialog"
        aria-describedby={description ? descriptionId : undefined}
        onClick={onClick}
        className="grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] gap-x-3 gap-y-1.5 whitespace-normal px-3 py-2.5 text-left"
      >
        <Icon className="size-4 justify-self-center text-muted-foreground" />
        <span>{label}</span>
        {status}
        <ChevronRightIcon className="col-start-4 size-4 text-muted-foreground" />
        {children && <span className="col-span-3 col-start-2 flex flex-col gap-1.5 font-normal">{children}</span>}
      </Button>
      {description && (
        <PreferenceDescription id={descriptionId} className="pr-3 pl-13">
          {description}
        </PreferenceDescription>
      )}
    </div>
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
      <p id={id} className="overflow-hidden text-muted-foreground text-sm">
        <span className="block pt-1">{children}</span>
      </p>
    </div>
  );
}
