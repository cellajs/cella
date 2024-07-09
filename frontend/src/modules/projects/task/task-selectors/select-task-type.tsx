import { Bolt, Bug, Check, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { dropdowner } from '~/modules/common/dropdowner/state';
import { Kbd } from '~/modules/common/kbd';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import type { TaskType } from '../create-task-form';

type Type = {
  value: (typeof taskTypes)[number]['value'];
  label: string;
  icon: () => JSX.Element;
};

export const taskTypes = [
  { value: 'feature', label: 'Feature', icon: () => <Star size={16} className="fill-amber-400 text-amber-500" /> },
  { value: 'chore', label: 'Chore', icon: () => <Bolt size={16} className="fill-slate-400 text-slate-500" /> },
  { value: 'bug', label: 'Bug', icon: () => <Bug size={16} className="fill-red-400 text-red-500" /> },
] as const;

export interface SelectTaskTypeProps {
  currentType: TaskType;
  className?: string;
  changeTaskType?: (value: TaskType) => void;
}

export const SelectTaskType = ({ currentType, changeTaskType, className = '' }: SelectTaskTypeProps) => {
  const { t } = useTranslation();

  const [selectedType, setSelectedType] = useState<Type | undefined>(taskTypes[taskTypes.findIndex((type) => type.value === currentType)]);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;

  useEffect(() => {
    setSelectedType(taskTypes[taskTypes.findIndex((type) => type.value === currentType)]);
  }, [currentType]);

  return (
    <Command className={cn(className, 'relative w-48 p-0 rounded-lg')}>
      <CommandInput
        autoFocus={true}
        clearValue={setSearchValue}
        value={searchValue}
        onValueChange={(searchValue) => {
          // If the user taskTypes a number, select the Impact like useHotkeys
          if ([0, 1, 2].includes(Number.parseInt(searchValue))) {
            const searchNumber = Number.parseInt(searchValue);
            if (changeTaskType) changeTaskType(taskTypes[searchNumber].value);
            setSelectedType(taskTypes[searchNumber]);
            dropdowner.remove();
            setSearchValue('');
            return;
          }
          setSearchValue(searchValue);
        }}
        className="leading-normal"
        placeholder={t('common:placeholder.type')}
      />
      {!isSearching && <Kbd value="T" className="absolute top-3 right-2.5" />}
      <CommandList>
        {!!searchValue.length && (
          <CommandEmpty className="flex justify-center items-center p-2 text-sm">
            {t('common:no_resource_found', { resource: t('common:type').toLowerCase() })}
          </CommandEmpty>
        )}
        <CommandGroup>
          {taskTypes.map((Type, index) => (
            <CommandItem
              key={Type.value}
              value={Type.value}
              onSelect={(value) => {
                const indexType = taskTypes.findIndex((type) => type.value === value);
                setSelectedType(taskTypes[indexType]);
                setSearchValue('');
                if (changeTaskType) changeTaskType(taskTypes[indexType].value);
                dropdowner.remove();
              }}
              className="group rounded-md flex justify-between items-center w-full leading-normal"
            >
              <div className="flex items-center gap-2">
                {Type.icon()}
                <span>{Type.label}</span>
              </div>
              <div className="flex items-center">
                {selectedType?.value === Type.value && <Check size={16} className="text-success" />}
                {!isSearching && <span className="max-xs:hidden text-xs ml-3 opacity-50 mr-1">{index}</span>}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
