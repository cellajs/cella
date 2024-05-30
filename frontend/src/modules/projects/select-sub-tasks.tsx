import { CommandEmpty } from 'cmdk';
import { Check, Dot, History, ListTodo, X } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMeasure } from '~/hooks/use-measure.tsx';
import { Button } from '~/modules/ui/button';
import type { PreparedTask, Task } from '../common/electric/electrify.ts';
import { Kbd } from '../common/kbd.tsx';
import { Badge } from '../ui/badge.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';
import { TaskContext } from './board-column.tsx';
import { Checkbox } from '../ui/checkbox.tsx';

interface Props {
  mode: 'create' | 'edit';
  viewValue?: PreparedTask[];
  onChange?: (tasks: Pick<Task, 'id'>[]) => void;
  tasks: PreparedTask[];
}

const SetSubTasks = ({ mode, viewValue, onChange, tasks }: Props) => {
  const { t } = useTranslation();
  const formValue = useFormContext?.()?.getValues('subTasks');
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<PreparedTask[]>(viewValue ? viewValue : formValue || []);
  const [searchValue, setSearchValue] = useState('');
  const { task, focusedTaskId } = useContext(TaskContext);
  const isSearching = searchValue.length > 0;
  const { ref, bounds } = useMeasure();

  const handleSelectClick = (value?: string) => {
    if (!value) return;
    const existingTask = selectedTasks.find((task) => task.id === value);
    if (existingTask) {
      setSelectedTasks(selectedTasks.filter((task) => task.id !== value));
      return;
    }
    const newTask = tasks.find((task) => task.id === value);
    if (newTask) {
      setSelectedTasks([...selectedTasks, newTask]);
      return;
    }
  };

  const renderTasks = (tasks: PreparedTask[]) => {
    return (
      <>
        {tasks.map((task, index) => (
          <CommandItem
            key={task.id}
            value={task.id}
            onSelect={(value) => {
              handleSelectClick(value);
              setSearchValue('');
            }}
            className="group rounded-md flex justify-between items-center w-full leading-normal"
          >
            <div className="flex items-center gap-2">
              {isSearching ? <Dot size={16} strokeWidth={8} /> : <History size={16} />}
              <span>{task.summary}</span>
            </div>
            <div className="flex items-center">
              {selectedTasks.some((t) => t.id === task.id) && <Check size={16} className="text-success" />}
              {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
            </div>
          </CommandItem>
        ))}
      </>
    );
  };

  // Open on key press
  useHotkeys([
    [
      'l',
      () => {
        if (focusedTaskId === task.id) setOpenPopover(true);
      },
    ],
  ]);

  // callback to change labels in task card
  useEffect(() => {
    if (onChange && JSON.stringify(selectedTasks) !== JSON.stringify(viewValue)) onChange(selectedTasks);
  }, [selectedTasks]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    if (mode === 'edit') return;
    setSelectedTasks(formValue || []);
  }, [formValue]);

  // watch for changes in the viewValue
  useEffect(() => {
    if (mode === 'create') return;
    setSelectedTasks(viewValue || []);
  }, [viewValue]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          ref={ref as React.LegacyRef<HTMLButtonElement>}
          aria-label="Set labels"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'micro'}
          className={`flex h-auto justify-start font-light ${
            mode === 'create' ? 'w-full text-left py-1 min-h-9 border hover:bg-accent/20' : 'py-[2px] group-hover/task:opacity-70 opacity-50'
          } ${mode === 'edit' && selectedTasks.length && ''}`}
        >
          {!selectedTasks.length && <ListTodo size={16} className="opacity-50" />}
          <div className="flex truncate flex-wrap gap-[1px]">
            {mode === 'create' && selectedTasks.length === 0 && <span className="ml-2">Choose sub tasks</span>}
            {selectedTasks.length > 0 &&
              selectedTasks.map(({ summary, id, status }) => {
                return (
                  <div key={id} className="flex flex-wrap align-center justify-center items-center rounded-full border pl-2 pr-1 bg-border">
                    <Badge
                      variant="outline"
                      key={id}
                      className={`border-0 font-normal px-1 text-[12px] ${mode === 'create' ? 'text-sm h-6' : 'h-5 bg-transparent'} last:mr-0`}
                    >
                      <Checkbox
                        checked={status === 6}
                        className="mr-1 w-3 h-3"
                      />
                      {summary}
                    </Badge>
                    {mode === 'create' && (
                      <Button
                        className="opacity-70 hover:opacity-100 rounded-full w-5 h-5 focus-visible:!ring-offset-0"
                        size="micro"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          handleSelectClick(id);
                        }}
                      >
                        <X size={16} strokeWidth={3} />
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        style={{ width: `${mode === 'create' ? `${Math.round(bounds.left + bounds.right + 2)}` : '260'}px` }}
        className="p-0 rounded-lg"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the label types a number, select the label like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number.parseInt(searchValue))) {
                handleSelectClick(tasks[Number.parseInt(searchValue)]?.id);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue.toLowerCase());
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.search_sub_tasks')}
          />
          {!isSearching && <Kbd value="L" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <CommandGroup>
              {!searchValue.length && (
                <>
                  {tasks.length === 0 && (
                    <CommandEmpty className="text-muted-foreground text-sm flex items-center justify-center px-3 py-2">
                      {t('common:no_resource_yet', { resource: t('common:labels').toLowerCase() })}
                    </CommandEmpty>
                  )}
                  {renderTasks(tasks)}
                </>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SetSubTasks;
