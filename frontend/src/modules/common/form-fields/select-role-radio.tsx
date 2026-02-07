import { useTranslation } from 'react-i18next';
import { appConfig, type EntityRole } from 'shared';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { cn } from '~/utils/cn';

interface Props {
  onChange: (value?: string) => void;
  value?: EntityRole;
  className?: string;
}

export function SelectRoleRadio({ onChange, value, className }: Props) {
  const { t } = useTranslation();

  const roles = appConfig.entityRoles;

  return (
    <RadioGroup value={value} onValueChange={onChange} className={cn('inline-flex gap-4 items-center', className)}>
      {roles.map((role) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: label is for visual grouping only, no input needed
        <label key={role} className="inline-flex gap-2 items-center cursor-pointer ">
          <RadioGroupItem key={role} value={role} />
          <span className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {t(role, { ns: ['app', 'common'] })}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
