import { CommandEmpty } from 'cmdk';
import { Check, Dot, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
// import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useMeasure } from '~/hooks/use-measure.tsx';
import { Button } from '~/modules/ui/button';
import { ScrollArea } from '~/modules/ui/scroll-area.tsx';
import type { Task } from '../../../common/electric/electrify.ts';
import { Kbd } from '../../../common/kbd.tsx';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../../../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover.tsx';

interface Props {
  mode: 'create' | 'edit';
  viewValue?: Task[];
  onChange?: (tasks: Pick<Task, 'id'>[]) => void;
  tasks: Task[];
}

const SetSubTasks = ({ mode, viewValue, onChange, tasks }: Props) => {
  const { t } = useTranslation();
  const formValue = useFormContext?.()?.getValues('subTasks');
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Task[]>(viewValue ? viewValue : formValue || []);
  const [searchValue, setSearchValue] = useState('');
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

  const renderTasks = (tasks: Task[]) => {
    return (
      <>
        {tasks.map((task) => (
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
            {selectedTasks.some((t) => t.id === task.id) && <Check size={16} className="text-success" />}
          </CommandItem>
        ))}
      </>
    );
  };

  // Open on key press
  // useHotkeys([
  //   [
  //     'l',
  //     () => {
  //       if (focusedTaskId === task.id) setOpenPopover(true);
  //     },
  //   ],
  // ]);

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
          size={mode === 'create' ? 'sm' : 'xs'}
          className={`flex h-auto justify-start font-light ${
            mode === 'create'
              ? 'w-full text-left py-1 min-h-9 border hover:bg-accent/20'
              : 'py-[2px] group-hover/task:opacity-70 group-[.is-focused]/task:opacity-70 opacity-50'
          } ${mode === 'edit' && selectedTasks.length && ''}`}
        >
          <div>+ Add Sub Task</div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        style={{ width: `${mode === 'create' ? `${Math.round(bounds.left + bounds.right + 2)}` : '260'}px` }}
        className="p-0  rounded-lg"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        sideOffset={4}
      >
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              setSearchValue(searchValue.toLowerCase());
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.search_sub_tasks')}
          />
          {!isSearching && <Kbd value="L" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <ScrollArea size="indicatorVertical" className="max-h-60 overflow-auto">
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
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SetSubTasks;
