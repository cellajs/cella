import { useTranslation } from 'react-i18next';
import { roles } from 'shared';
import { Checkbox } from '~/modules/ui/checkbox';
import { cn } from '~/utils/cn';

interface SelectRoleProps {
  onValueChange: (value: string[]) => void;
  value?: string[];
  className?: string;
}

const EMPTY_ROLES: string[] = [];

/**
 * Checkbox group for selecting multiple entity roles.
 */
export function SelectRoles({ onValueChange, value = EMPTY_ROLES, className }: SelectRoleProps) {
  const { t } = useTranslation();

  const handleCheckboxChange = (role: string) => {
    const newValue = value.includes(role)
      ? value.filter((selectedRole) => selectedRole !== role) // Remove role if it already exists
      : [...value, role];
    onValueChange(newValue);
  };

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      {roles.all.map((role) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: label is for visual grouping only, no input needed
        <label key={role} className="inline-flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={value.includes(role)}
            onCheckedChange={() => handleCheckboxChange(role)}
            className="size-5"
          />
          <span className="font-normal text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {t(role)}
          </span>
        </label>
      ))}
    </div>
  );
}
