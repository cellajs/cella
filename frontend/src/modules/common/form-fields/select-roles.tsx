import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '~/modules/ui/checkbox';
import { cn } from '~/utils/cn';

interface SelectRoleProps {
  onChange: (value: string[]) => void;
  value?: string[];
  className?: string;
}

const SelectRoles = ({ onChange, value = [], className }: SelectRoleProps) => {
  const { t } = useTranslation();

  const handleCheckboxChange = (role: string) => {
    const newValue = value.includes(role)
      ? value.filter((selectedRole) => selectedRole !== role) // Remove role if it already exists
      : [...value, role];
    onChange(newValue);
  };

  return (
    <div className={cn('inline-flex gap-2 items-center', className)}>
      {config.rolesByType.entityRoles.map((role) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: <explanation>
        <label key={role} className="inline-flex gap-2 items-center cursor-pointer ">
          <Checkbox checked={value.includes(role)} onCheckedChange={() => handleCheckboxChange(role)} className="w-5 h-5" />
          <span className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t(role)}</span>
        </label>
      ))}
    </div>
  );
};

export default SelectRoles;
