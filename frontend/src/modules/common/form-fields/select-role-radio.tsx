import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, type EntityRole, hierarchy, roles } from 'shared';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { cn } from '~/utils/cn';

interface Props {
  onValueChange: (value?: EntityRole) => void;
  value?: EntityRole;
  /** Restrict options to this channel entity's role vocabulary (e.g. course → staff/student/guest). */
  entityType?: ChannelEntityType;
  className?: string;
}

/**
 * Radio group for selecting a single entity role.
 */
export function SelectRoleRadio({ onValueChange, value, entityType, className }: Props) {
  const { t } = useTranslation();

  const roleOptions = entityType ? hierarchy.getRoles(entityType) : roles.all;

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onValueChange(v as EntityRole)}
      className={cn('inline-flex items-center gap-4', className)}
    >
      {roleOptions.map((role) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: label is for visual grouping only, no input needed
        <label key={role} className="inline-flex cursor-pointer items-center gap-2">
          <RadioGroupItem key={role} value={role} />
          <span className="font-normal text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {t(role)}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
