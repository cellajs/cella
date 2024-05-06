import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { RadioGroupItem, RadioGroup } from '~/modules/ui/radio-group';

interface SelectRoleProps {
  roles: readonly { key: string; value: string }[];
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

const SelectRole = ({ roles, onChange, value, className }: SelectRoleProps) => {
  const { t } = useTranslation();

  return (
    <RadioGroup value={value} onValueChange={onChange} className={cn('inline-flex gap-2 items-center', className)}>
      {roles.map(({ key, value: roleName }) => (
        <label className="inline-flex gap-1 items-center cursor-pointer ">
          <RadioGroupItem key={key} value={key} />
          <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{t(roleName)}</span>
        </label>
      ))}
    </RadioGroup>
  );
};

export default SelectRole;
