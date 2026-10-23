import { Fieldset } from '@base-ui/react/fieldset';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { type EntityRole, roles } from 'shared';
import { Checkbox } from '~/modules/ui/checkbox';
import { RequiredMark } from '~/modules/ui/field';
import { cn } from '~/utils/cn';

export interface RoleGroupProps {
  /** Group name, rendered as the legend. A `FormLabel` would name every option after the group. */
  label?: ReactNode;
  className?: string;
}

interface SelectRolesProps extends RoleGroupProps {
  onChange: (value: EntityRole[]) => void;
  value?: EntityRole[];
  /** Puts a star after the legend. */
  required?: boolean;
}

interface RoleOptionProps {
  role: EntityRole;
  /** The option's control, named by the label with this id. */
  renderControl: (labelId: string) => ReactNode;
}

/** A role with its control. Inside a form Field every control would take the field's label; the role's own label id keeps its name. */
export function RoleOption({ role, renderControl }: RoleOptionProps) {
  const { t } = useTranslation();
  const labelId = useId();

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Base UI control renders the hidden input this label wraps
    <label className="inline-flex cursor-pointer items-center gap-2">
      {renderControl(labelId)}
      <span id={labelId} className="font-normal text-sm leading-none peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-70">
        {t(role)}
      </span>
    </label>
  );
}

const emptyRoles: EntityRole[] = [];

export function SelectRoles({ onChange, value = emptyRoles, label, required, className }: SelectRolesProps) {
  const toggleRole = (role: EntityRole) => onChange(value.includes(role) ? value.filter((selectedRole) => selectedRole !== role) : [...value, role]);

  return (
    <Fieldset.Root className="flex flex-col gap-2">
      {label && (
        <Fieldset.Legend className="font-medium text-sm">
          {label}
          {required && <RequiredMark />}
        </Fieldset.Legend>
      )}
      <div className={cn('inline-flex items-center gap-2', className)}>
        {roles.all.map((role) => (
          <RoleOption
            key={role}
            role={role}
            renderControl={(labelId) => (
              <Checkbox checked={value.includes(role)} onCheckedChange={() => toggleRole(role)} aria-labelledby={labelId} />
            )}
          />
        ))}
      </div>
    </Fieldset.Root>
  );
}
