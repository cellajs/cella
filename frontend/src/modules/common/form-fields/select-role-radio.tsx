import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, type EntityRole, hierarchy, roles } from 'shared';
import type { RoleGroupProps } from '~/modules/common/form-fields/select-roles';
import { SegmentedControl, SegmentedControlItem } from '~/modules/ui/segmented-control';
import { cn } from '~/utils/cn';

interface SelectRoleRadioProps extends RoleGroupProps {
  onChange: (value?: EntityRole) => void;
  value?: EntityRole;
  /** The channel entity whose roles are offered; every role without one. */
  entityType?: ChannelEntityType;
}

/** Inside a form Field a control would take the field's label, so each segment names itself. */
function RoleSegment({ role }: { role: EntityRole }) {
  const { t } = useTranslation();
  const labelId = useId();

  return (
    <SegmentedControlItem value={role} aria-labelledby={labelId}>
      <span id={labelId}>{t(role)}</span>
    </SegmentedControlItem>
  );
}

/** One role of a few, as a segmented control. */
export function SelectRoleRadio({ onChange, value, entityType, label, className }: SelectRoleRadioProps) {
  const id = useId();
  const roleOptions = entityType ? hierarchy.getRoles(entityType) : roles.all;

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      {label && (
        <span id={id} className="font-medium text-sm">
          {label}
        </span>
      )}
      <SegmentedControl
        size="sm"
        aria-labelledby={label ? id : undefined}
        // Null selects no role and keeps the group controlled: an undefined value would make it uncontrolled until a role is picked.
        value={value ?? null}
        onValueChange={(role) => onChange(roleOptions.find((option) => option === role))}
      >
        {roleOptions.map((role) => (
          <RoleSegment key={role} role={role} />
        ))}
      </SegmentedControl>
    </div>
  );
}
