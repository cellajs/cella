import { ChevronRightIcon } from 'lucide-react';
import { type ReactNode, type Ref, useState } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
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
        <h3 className="group-label">{title}</h3>
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
        <label htmlFor={id} className="cursor-pointer select-none font-medium text-sm leading-4">
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
  ref?: Ref<HTMLButtonElement>;
  onClick: () => void;
  /** Detail under the label, such as a meter. */
  children?: ReactNode;
}

/**
 * A button that opens a preference's dialog. Its icon takes the switch column, so its label lines up with the switches.
 * Its hover background is `bg-muted`, so a muted fill in `status` or `children` switches on `group-hover/preference` to
 * stay visible.
 */
export function PreferenceButton({ icon: Icon, label, status, ref, onClick, children }: PreferenceButtonProps) {
  return (
    <Button
      ref={ref}
      variant="outline"
      size="auto"
      aria-haspopup="dialog"
      onClick={onClick}
      className="group/preference grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] gap-x-3 gap-y-1.5 whitespace-normal px-3 py-2.5 text-left"
    >
      <Icon className="size-4 justify-self-center" />
      <span>{label}</span>
      {status}
      <ChevronRightIcon className="col-start-4 size-4 text-muted-foreground" />
      {children && <span className="col-span-3 col-start-2 flex flex-col gap-1.5 font-normal">{children}</span>}
    </Button>
  );
}

/** Opens and closes with its group's help toggle through `group/prefs`. */
function PreferenceDescription({ id, children }: { id: string; children: ReactNode }) {
  return (
    // The grid row animates from `0fr` to `1fr`, as HelpCollapse does, so the text opens and closes smoothly.
    <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-200 group-data-[help-open=true]/prefs:grid-rows-[1fr] group-data-[help-open=true]/prefs:opacity-100 motion-reduce:transition-none">
      <p id={id} className="overflow-hidden text-muted-foreground text-sm">
        <span className="block pt-1">{children}</span>
      </p>
    </div>
  );
}
