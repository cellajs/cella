import { Fieldset } from '@base-ui/react/fieldset';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { type EntityRole, roles } from 'shared';
import { Checkbox } from '~/modules/ui/checkbox';
import { cn } from '~/utils/cn';

interface SelectRoleProps {
  onValueChange: (value: EntityRole[]) => void;
  value?: EntityRole[];
  /** Group name, rendered as the legend. A `FormLabel` would name every option after the group. */
  label?: ReactNode;
  className?: string;
}

const EMPTY_ROLES: EntityRole[] = [];

export function SelectRoles({ onValueChange, value = EMPTY_ROLES, label, className }: SelectRoleProps) {
  const { t } = useTranslation();
  // Inside a form Field every checkbox would take the field's label; an explicit id per option keeps their own names.
  const labelIdPrefix = useId();

  const handleCheckboxChange = (role: EntityRole) => {
    const newValue = value.includes(role)
      ? value.filter((selectedRole) => selectedRole !== role) // Remove role if it already exists
      : [...value, role];
    onValueChange(newValue);
  };

  return (
    <Fieldset.Root className="flex flex-col gap-2">
      {label && <Fieldset.Legend className="font-medium text-sm">{label}</Fieldset.Legend>}
      <div className={cn('inline-flex items-center gap-2', className)}>
        {roles.all.map((role) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: the Base UI checkbox renders the hidden input this label wraps
          <label key={role} className="inline-flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={value.includes(role)}
              onCheckedChange={() => handleCheckboxChange(role)}
              aria-labelledby={`${labelIdPrefix}-${role}`}
              className="size-5"
            />
            <span
              id={`${labelIdPrefix}-${role}`}
              className="font-normal text-sm leading-none peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-70"
            >
              {t(role)}
            </span>
          </label>
        ))}
      </div>
    </Fieldset.Root>
  );
}
