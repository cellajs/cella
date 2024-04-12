import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utils';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Command, CommandInput, CommandItem, CommandSeparator } from '~/modules/ui/command';
import { Input } from '~/modules/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { PopoverPortal } from '@radix-ui/react-popover';
import { ScrollArea } from '../ui/scroll-area';
import { CommandList } from 'cmdk';

type LabelType = Record<'value' | 'label' | 'color', string>;

const Labels = [
  {
    value: 'next.js',
    label: 'Next.js',
    color: '#ef4444',
  },
  {
    value: 'sveltekit',
    label: 'SvelteKit',
    color: '#eab308',
  },
  {
    value: 'nuxt.js',
    label: 'Nuxt.js',
    color: '#22c55e',
  },
  {
    value: 'remix',
    label: 'Remix',
    color: '#06b6d4',
  },
  {
    value: 'astro',
    label: 'Astro',
    color: '#3b82f6',
  },
  {
    value: 'wordpress',
    label: 'WordPress',
    color: '#8b5cf6',
  },
] satisfies LabelType[];

const badgeStyle = (color: string) => ({
  borderColor: `${color}20`,
  backgroundColor: `${color}30`,
  color,
});

export const LabelBox = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [labels, setLabels] = React.useState<LabelType[]>(Labels);
  const [isOpenEditLabel, setOpenEditLabel] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState<string>('');
  const [selectedLabels, setSelectedLabels] = React.useState<LabelType[]>([Labels[0], Labels[1], Labels[2]]);
  const [editedValue, setEditedValue] = React.useState<string>('');

  const createLabel = (name: string) => {
    const newLabel = {
      value: name.toLowerCase(),
      label: name,
      color: '#ffffff',
    };
    setLabels((prev) => [...prev, newLabel]);
    setSelectedLabels((prev) => [...prev, newLabel]);
  };

  const toggleLabel = (label: LabelType) => {
    setSelectedLabels((currentLabels) =>
      !currentLabels.includes(label) ? [...currentLabels, label] : currentLabels.filter((l) => l.value !== label.value),
    );
    inputRef?.current?.focus();
  };

  const updateLabel = (label: LabelType, newLabel: LabelType) => {
    setLabels((prev) => prev.map((f) => (f.value === label.value ? newLabel : f)));
    setSelectedLabels((prev) => prev.map((f) => (f.value === label.value ? newLabel : f)));
  };

  const deleteLabel = (label: LabelType) => {
    setLabels((prev) => prev.filter((f) => f.value !== label.value));
    setSelectedLabels((prev) => prev.filter((f) => f.value !== label.value));
  };

  const onComboboxOpenChange = (value: boolean) => {
    inputRef.current?.blur(); // HACK: otherwise, would scroll automatically to the bottom of page
    setOpenEditLabel(value);
  };

  const submitLabelItemClick = (event: React.FormEvent<HTMLFormElement>, label: LabelType) => {
    event.preventDefault();
    const target = event.target as typeof event.target & Record<'name' | 'color', { value: string }>;
    const newLabel = {
      value: target.name.value.toLowerCase(),
      label: target.name.value,
      color: target.color.value,
    };
    updateLabel(label, newLabel);
  };

  return (
    <>
      <Popover open={isOpenEditLabel} onOpenChange={onComboboxOpenChange}>
        <PopoverTrigger asChild>
          <div className="relative w-full min-h-[22px] flex align-center justify-start overflow-hidden gap-1">
            {!isOpenEditLabel &&
              selectedLabels.map(({ label, value, color }) => (
                <button type="button" onClick={() => setOpenEditLabel(true)}>
                  <Badge key={value} variant="outline" style={badgeStyle(color)}>
                    {label}
                  </Badge>
                </button>
              ))}
            {!isOpenEditLabel && selectedLabels.length < 1 && (
              <Button size={'micro'} className="text-muted" variant="none" onClick={() => setOpenEditLabel(true)}>
                No labels yet
              </Button>
            )}
          </div>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput
                ref={inputRef}
                placeholder="Search label..."
                value={searchValue}
                setZeroValue={setSearchValue}
                onValueChange={setSearchValue}
              />
              <div className="pt-2.5 pb-2.5 pl-0.5 pr-0.5">
                <CommandList>
                  <ScrollArea className="h-[200px] overflow-y-auto pl-2 pr-3">
                    <div className="flex-1 min-w-[375px]">
                      {labels
                        .filter((label) => label.value.includes(searchValue.toLowerCase()))
                        .map((label) => {
                          const isActive = selectedLabels.includes(label);
                          return (
                            <>
                              <LabelsListItem
                                editedValue={editedValue}
                                setEditedValue={setEditedValue}
                                onSelect={() => toggleLabel(label)}
                                isActive={isActive}
                                onDelete={() => deleteLabel(label)}
                                onSubmit={(e) => submitLabelItemClick(e, label)}
                                {...label}
                              />
                              <CommandSeparator />
                            </>
                          );
                        })}
                    </div>
                  </ScrollArea>
                  <CreateLabel setDefaultSearch={setSearchValue} onSelect={() => createLabel(searchValue)} {...{ searchValue, labels }} />
                </CommandList>
              </div>
            </Command>
          </PopoverContent>
        </PopoverPortal>
      </Popover>
    </>
  );
};

type CreateLabelType = {
  searchValue: string;
  labels: LabelType[];
  onSelect: () => void;
  setDefaultSearch: (value: '') => void;
};

const CreateLabel = ({ searchValue, setDefaultSearch, labels, onSelect }: CreateLabelType) => {
  const hasNoLabel = !labels.some((label) => label.value === searchValue.toLowerCase());
  const render = searchValue !== '' && hasNoLabel;
  if (!render) return null;

  // BUG: whenever a space is appended, the Create-Button will not be shown.
  return (
    <>
      {searchValue && hasNoLabel && (
        <CommandItem
          key={searchValue}
          value={searchValue}
          className="aria-selected:bg-transparent mt-2 text-xs text-muted-foreground"
          onSelect={onSelect}
        >
          <Button onClick={() => setDefaultSearch('')} className="w-full" variant={'outlineGhost'} size={'xs'}>
            Create new label &quot;{searchValue}&quot;
          </Button>
        </CommandItem>
      )}
    </>
  );
};

type LabelsItem = LabelType & {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  isActive: boolean;
  onSelect: () => void;
  editedValue: string;
  setEditedValue: (newValue: string) => void;
};

const LabelsListItem = ({ value, label, color, editedValue, setEditedValue, onSubmit, onDelete, onSelect, isActive }: LabelsItem) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [newLabelName, setNewLabelName] = React.useState<string>(label);
  const [newColorValue, setNewColorValue] = React.useState<string>(color);
  const disabled = label === newLabelName && color === newColorValue;

  React.useEffect(() => {
    if (editedValue === value) inputRef.current?.focus();
  }, [editedValue, value]);

  const handleEditClick = () => {
    setEditedValue(value);
  };

  const handleCancelEdit = () => {
    setEditedValue('');
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(e);
    setEditedValue('');
  };

  return (
    <div className="py-3 text-sm font-medium transition-all">
      {editedValue !== value ? (
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Check className={cn('h-4 w-4', isActive ? 'opacity-100' : 'opacity-0')} />
            <Button size={'micro'} variant={'none'} onClick={onSelect}>
              <Badge className="h-8 px-2 rounded-[12px]" variant="outline" style={badgeStyle(color)}>
                {label}
              </Badge>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleEditClick} variant="outlineGhost" size="xs">
              Edit
            </Button>
            <Button onClick={onDelete} variant="destructive" size="xs">
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <form className="flex ml-1 gap-2" onSubmit={handleSubmit}>
          <Input
            ref={inputRef}
            id="name"
            value={newLabelName}
            onChange={(e: { target: { value: React.SetStateAction<string> } }) => setNewLabelName(e.target.value)}
            className="h-8"
          />
          <Input
            id="color"
            type="color"
            value={newColorValue}
            style={{ padding: '0', cursor: 'pointer' }}
            onChange={(e: { target: { value: React.SetStateAction<string> } }) => setNewColorValue(e.target.value)}
            className="h-8 w-14"
          />
          <div className="gap-1.5 flex">
            <Button variant="outlineGhost" type="submit" disabled={disabled} size="xs">
              Save
            </Button>
            <Button variant="outlineGhost" onClick={handleCancelEdit} size="xs">
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
