import { Bolt, Bug, Check, Star } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { Kbd } from '~/modules/common/kbd';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Button } from '../../../ui/button';
import { TaskContext } from '../../board/board-column';
import type { TaskType } from '../create-task-form';

type Type = {
  value: (typeof types)[number]['value'];
  label: string;
  icon: () => JSX.Element;
};

const types = [
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

  const [openPopover, setOpenPopover] = useState(false);
  const [selectedType, setSelectedType] = useState<Type>(types[types.findIndex((type) => type.value === currentType)]);
  const [searchValue, setSearchValue] = useState('');
  const { task, focusedTaskId } = useContext(TaskContext);
  const isSearching = searchValue.length > 0;
  // Open on key press
  useHotkeys([
    [
      't',
      () => {
        if (focusedTaskId === task.id) setOpenPopover(true);
      },
    ],
  ]);

  useEffect(() => {
    setSelectedType(types[types.findIndex((type) => type.value === currentType)]);
  }, [currentType]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger className={className} asChild>
        <Button
          aria-label="Set status"
          variant="ghost"
          size="xs"
          className={'group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-70'}
        >
          {selectedType.icon()}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-48 p-0 rounded-lg" align="start" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4}>
        <Command className="relative rounded-lg">
          <CommandInput
            clearValue={setSearchValue}
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select the Impact like useHotkeys
              if ([0, 1, 2].includes(Number.parseInt(searchValue))) {
                const searchNumber = Number.parseInt(searchValue);
                if (changeTaskType) changeTaskType(types[searchNumber].value);
                setSelectedType(types[searchNumber]);
                setOpenPopover(false);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            className="leading-normal"
            placeholder={t('common:placeholder.type')}
          />
          {!isSearching && <Kbd value="T" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <CommandGroup>
              {types.map((Type, index) => (
                <CommandItem
                  key={Type.value}
                  value={Type.value}
                  onSelect={(value) => {
                    const indexType = types.findIndex((type) => type.value === value);
                    setSelectedType(types[indexType]);
                    setOpenPopover(false);
                    setSearchValue('');
                    if (changeTaskType) changeTaskType(types[indexType].value);
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
      </PopoverContent>
    </Popover>
  );
};
