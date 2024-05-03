import { useContext, useEffect, useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Check, Dot, History, Tag } from 'lucide-react';
import { CommandItem, CommandList, Command, CommandInput, CommandGroup } from '../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';
import { Kbd } from '../common/kbd.tsx';
import { Badge } from '../ui/badge.tsx';
import { useTranslation } from 'react-i18next';
import { useHotkeys } from '~/hooks/use-hot-keys.ts';
import { useFormContext } from 'react-hook-form';
import { faker } from '@faker-js/faker';
import type { TaskLabel } from '~/mocks/workspaces.ts';
import { WorkspaceContext } from '../workspaces/index.tsx';

const badgeStyle = (color?: string | null) => {
  if (!color) return {};
  return {};
};

interface SetLabelsProps {
  mode: 'create' | 'edit';
  projectId: string;
  viewValue?: TaskLabel[];
  changeLabels?: (labels: TaskLabel[]) => void;
}

const SetLabels = ({ mode, viewValue, changeLabels }: SetLabelsProps) => {
  const { t } = useTranslation();
  const { labels } = useContext(WorkspaceContext);
  const formValue = useFormContext?.()?.getValues('labels');
  const [labelsForMap, _] = useState<TaskLabel[]>(labels);
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<TaskLabel[]>(viewValue ? viewValue : formValue || []);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;

  const handleSelectClick = (value: string) => {
    if (!value) return;
    const existingLabel = selectedLabels.find((label) => label.value === value);
    if (existingLabel) {
      setSelectedLabels(selectedLabels.filter((label) => label.value !== value));
      return;
    }
    const newLabel = labels.find((label) => label.value === value);
    if (newLabel) {
      setSelectedLabels([...selectedLabels, newLabel]);
      return;
    }
  };

  const createLabel = (value: string) => {
    const newLabel: TaskLabel = {
      id: faker.string.uuid(),
      value,
      color: null,
    };
    setSelectedLabels((prev) => [...prev, newLabel]);
    setSearchValue('');
    //  changeLabels?.([...passedLabels, newLabel]);
  };

  // Open on key press
  useHotkeys([['l', () => setOpenPopover(true)]]);

  // callback to change labels in task card
  useEffect(() => {
    if (changeLabels && selectedLabels.length > 0) changeLabels(selectedLabels);
  }, [selectedLabels]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    if (mode === 'edit') return;
    setSelectedLabels(formValue || []);
  }, [formValue]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Set labels"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'micro'}
          className={`flex h-auto justify-start font-light ${
            mode === 'create' ? 'w-full text-left py-1 border' : 'py-[2px] group-hover/task:opacity-70 opacity-50'
          } ${mode === 'edit' && selectedLabels.length && ''}`}
        >
          {!selectedLabels.length && <Tag size={16} className="opacity-50" />}
          <div className="flex truncate flex-wrap gap-[1px]">
            {mode === 'create' && selectedLabels.length === 0 && <span className="ml-2">Choose labels</span>}
            {selectedLabels.length > 0 &&
              selectedLabels.map(({ value, id, color }) => {
                return (
                  <Badge
                    variant="outline"
                    key={id}
                    className={`border-0 font-normal px-1 text-[12px] ${mode === 'create' ? 'text-sm mr-1 h-6' : 'h-5'} last:mr-0 bg-transparent`}
                    style={badgeStyle(color)}
                  >
                    {value}
                  </Badge>
                );
              })}
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-60 p-0 rounded-lg" align="start" onCloseAutoFocus={(e) => e.preventDefault()} sideOffset={4}>
        <Command className="relative rounded-lg">
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              // If the label types a number, select the label like useHotkeys
              if ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number.parseInt(searchValue))) {
                handleSelectClick(labels[Number.parseInt(searchValue)]?.value);
                setSearchValue('');
                return;
              }
              setSearchValue(searchValue);
            }}
            clearValue={setSearchValue}
            className="leading-normal"
            placeholder={t('common:placeholder.search_labels')}
          />
          {!isSearching && <Kbd value="L" className="absolute top-3 right-[10px]" />}
          <CommandList>
            <CommandGroup>
              {labelsForMap.map((label, index) => (
                <CommandItem
                  key={label.id}
                  value={label.value}
                  onSelect={(value) => {
                    handleSelectClick(value);
                    setSearchValue('');
                  }}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center gap-2">
                    {isSearching ? <Dot size={16} style={badgeStyle(label.color)} strokeWidth={8} /> : <History size={16} />}
                    <span>{label.value}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedLabels.some((l) => l.id === label.id) && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandItemCreate onSelect={() => createLabel(searchValue)} {...{ searchValue, labels }} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SetLabels;

interface CommandItemCreateProps {
  searchValue: string;
  labels: TaskLabel[];
  onSelect: () => void;
}

const CommandItemCreate = ({ searchValue, labels, onSelect }: CommandItemCreateProps) => {
  const { t } = useTranslation();
  const hasNoLabel = !labels.map(({ id }) => id).includes(`${searchValue.toLowerCase()}`);

  const render = searchValue !== '' && hasNoLabel;

  if (!render) return null;

  // BUG: whenever a space is appended, the Create-Button will not be shown.
  return (
    <CommandItem key={`${searchValue}`} value={`${searchValue}`} className="text-sm m-1 flex justify-center items-center" onSelect={onSelect}>
      {t('common:create_label')}{' '}
      <Badge className="ml-2 px-2 py-0 font-light" variant="plain">
        {searchValue}
      </Badge>
    </CommandItem>
  );
};
