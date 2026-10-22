import { Fieldset } from '@base-ui/react/fieldset';
import { type ChannelEntityType, type EntityRole, hierarchy, roles } from 'shared';
import { type RoleGroupProps, RoleOption } from '~/modules/common/form-fields/select-roles';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { cn } from '~/utils/cn';

interface SelectRoleRadioProps extends RoleGroupProps {
  onChange: (value?: EntityRole) => void;
  value?: EntityRole;
  /** The channel entity whose roles are offered; every role without one. */
  entityType?: ChannelEntityType;
}

export function SelectRoleRadio({ onChange, value, entityType, label, className }: SelectRoleRadioProps) {
  const roleOptions = entityType ? hierarchy.getRoles(entityType) : roles.all;

  return (
    <Fieldset.Root
      render={
        <RadioGroup
          // Null selects no role and keeps the group controlled: an undefined value would make it uncontrolled until a role is picked.
          value={value ?? null}
          onValueChange={(role) => onChange(roleOptions.find((option) => option === role))}
          className={cn('inline-flex items-center gap-4', className)}
        />
      }
    >
      {label && <Fieldset.Legend className="font-medium text-sm">{label}</Fieldset.Legend>}
      {roleOptions.map((role) => (
        <RoleOption key={role} role={role} renderControl={(labelId) => <RadioGroupItem value={role} aria-labelledby={labelId} className="peer" />} />
      ))}
    </Fieldset.Root>
  );
}
