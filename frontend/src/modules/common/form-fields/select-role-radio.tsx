import { Fieldset } from '@base-ui/react/fieldset';
import { type ChannelEntityType, type EntityRole, hierarchy, roles } from 'shared';
import { type RoleGroupProps, RoleOption } from '~/modules/common/form-fields/select-roles';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { cn } from '~/utils/cn';

interface Props extends RoleGroupProps {
  onValueChange: (value?: EntityRole) => void;
  value?: EntityRole;
  /** Restrict options to this channel entity's role vocabulary (e.g. course → staff/student/guest). */
  entityType?: ChannelEntityType;
}

export function SelectRoleRadio({ onValueChange, value, entityType, label, className }: Props) {
  const roleOptions = entityType ? hierarchy.getRoles(entityType) : roles.all;

  return (
    <Fieldset.Root
      render={
        <RadioGroup
          // Null selects no role and keeps the group controlled: an undefined value would make it uncontrolled until a role is picked.
          value={value ?? null}
          onValueChange={(v) => onValueChange(v as EntityRole)}
          className={cn('inline-flex items-center gap-4', className)}
        />
      }
    >
      {label && <Fieldset.Legend className="font-medium text-sm">{label}</Fieldset.Legend>}
      {roleOptions.map((role) => (
        <RoleOption key={role} role={role} control={(labelId) => <RadioGroupItem value={role} aria-labelledby={labelId} className="peer" />} />
      ))}
    </Fieldset.Root>
  );
}
