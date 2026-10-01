import { Fieldset } from '@base-ui/react/fieldset';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, type EntityRole, hierarchy, roles } from 'shared';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { cn } from '~/utils/cn';

interface Props {
  onValueChange: (value?: EntityRole) => void;
  value?: EntityRole;
  /** Restrict options to this channel entity's role vocabulary (e.g. course → staff/student/guest). */
  entityType?: ChannelEntityType;
  /** Group name, rendered as the legend. A `FormLabel` would name every option after the group. */
  label?: ReactNode;
  className?: string;
}

export function SelectRoleRadio({ onValueChange, value, entityType, label, className }: Props) {
  const { t } = useTranslation();
  // Inside a form Field every radio would take the field's label; an explicit id per option keeps their own names.
  const labelIdPrefix = useId();

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
        // biome-ignore lint/a11y/noLabelWithoutControl: the Base UI radio renders the hidden input this label wraps
        <label key={role} className="inline-flex cursor-pointer items-center gap-2">
          <RadioGroupItem value={role} aria-labelledby={`${labelIdPrefix}-${role}`} className="peer" />
          <span
            id={`${labelIdPrefix}-${role}`}
            className="font-normal text-sm leading-none peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-70"
          >
            {t(role)}
          </span>
        </label>
      ))}
    </Fieldset.Root>
  );
}
