import { useTranslation } from 'react-i18next';
import { type EntityRole, roles } from 'shared';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { cn } from '~/utils/cn';

interface Props {
  onChange: (value?: string) => void;
  value?: EntityRole;
  className?: string;
}

/**
 * Radio group for selecting a single entity role.
 */
export function SelectRoleRadio({ onChange, value, className }: Props) {
  const { t } = useTranslation();

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as string)}
      className={cn('inline-flex items-center gap-4', className)}
    >
      {roles.all.map((role) => (
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
