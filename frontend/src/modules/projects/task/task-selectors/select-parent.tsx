import { Check } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMeasure } from '~/hooks/use-measure.tsx';
import { Button } from '~/modules/ui/button';
import type { PreparedTask, Task } from '../../../common/electric/electrify.ts';
import { Kbd } from '../../../common/kbd.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover.tsx';
import { TaskContext } from '../../board/board-column.tsx';

interface Props {
  mode: 'create' | 'edit';
  tasks: PreparedTask[];
  parent: PreparedTask | null;
  onChange: (parent: Pick<Task, 'id'> | null) => void;
}

const SelectParent = ({ tasks, mode, parent, onChange }: Props) => {
  const { t } = useTranslation();
  const formValue = useFormContext?.()?.getValues('parentId');
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PreparedTask | Task | null>(parent ? parent : tasks.find((task) => task.id === formValue) || null);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;
  const { ref, bounds } = useMeasure();
  const { task, focusedTaskId } = useContext(TaskContext);
  const handleSelectClick = (id: string) => {
    if (!id) return;
    const existingTask = selectedTask?.id === id;
    if (existingTask) {
      setSelectedTask(null);
      return;
    }
    const newTask = tasks.find((task) => task.id === id);
    if (newTask) {
      setSelectedTask(newTask);
      return;
    }
  };
  // Open on key press
  useHotkeys([
    [
      'a',
      () => {
        if (focusedTaskId === task.id) setOpenPopover(true);
      },
    ],
  ]);

  useEffect(() => {
    if (onChange && JSON.stringify(selectedTask) !== JSON.stringify(parent)) onChange(selectedTask);
  }, [selectedTask]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    if (mode === 'edit') return;
    setSelectedTask(tasks.find((task) => task.id === formValue) || null);
  }, [formValue]);

  // watch for changes in the viewValue
  useEffect(() => {
    if (mode === 'create') return;
    setSelectedTask(parent);
  }, [parent]);

  if (!selectedTask) return null;

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          ref={ref as React.LegacyRef<HTMLButtonElement>}
          aria-label="Set parent task"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'xs'}
          className={`flex justify-start font-light ${
            mode === 'create' ? 'w-full text-left border' : 'group-hover/task:opacity-100 group-[.is-focused]/task:opacity-100 opacity-70'
          } ${mode === 'edit' && selectedTask && 'px-0 hover:bg-transparent'}`}
        >
          {/* {!selectedTask && <UserX className="h-4 w-4 opacity-50" />} */}
          <span className="ml-2 truncate">Sub task of "{selectedTask.summary}"</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        style={{ width: `${mode === 'create' ? `${Math.round(bounds.left + bounds.right + 2)}` : '240'}px` }}
        className="p-0 rounded-lg"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the user types a number, select the user like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6].includes(Number.parseInt(searchValue))) {
                // handleSelectClick(project.members[Number.parseInt(searchValue)]?.name);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.search_parent_task')}
          />
          {!isSearching && <Kbd value="A" className="absolute top-3 right-[10px]" />}
          <CommandList>
            {tasks && (
              <CommandGroup>
                {tasks.map((task, index) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    onSelect={(id) => {
                      handleSelectClick(id);
                      setSearchValue('');
                    }}
                    className="group rounded-md flex justify-between items-center w-full leading-normal"
                  >
                    <div className="flex items-center gap-3">
                      <span>{task.summary}</span>
                    </div>

                    <div className="flex items-center">
                      {selectedTask?.id === task.id && <Check size={16} className="text-success" />}
                      {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SelectParent;
