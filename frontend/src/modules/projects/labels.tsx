import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem } from '~/modules/ui/command';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
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
  const [accordionValue, setAccordionValue] = React.useState<string>('');

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
          <div className="relative flex align-center justify-start overflow-y-auto gap-1 ">
            {selectedLabels.map(({ label, value, color }) => (
              <button type="button" onClick={() => setOpenEditLabel(true)}>
                <Badge key={value} variant="outline" style={badgeStyle(color)}>
                  {label}
                </Badge>
              </button>
            ))}
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
              <CommandGroup>
                <CommandList>
                  <ScrollArea className="h-[200px] overflow-y-auto pl-2 pr-3">
                    <div className="flex-1 min-w-[340px]">
                      {labels
                        .filter((label) => label.label.toLowerCase().includes(searchValue.toLowerCase()))
                        .map((label) => {
                          const isActive = selectedLabels.includes(label);
                          return (
                            <LabelsListItem
                              accordionValue={accordionValue}
                              setAccordionValue={setAccordionValue}
                              onSelect={() => toggleLabel(label)}
                              isActive={isActive}
                              onDelete={() => deleteLabel(label)}
                              onSubmit={(e) => submitLabelItemClick(e, label)}
                              {...label}
                            />
                          );
                        })}
                    </div>
                  </ScrollArea>
                  <CreateLabel onSelect={() => createLabel(searchValue)} {...{ searchValue, labels }} />
                </CommandList>
              </CommandGroup>
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
};

const CreateLabel = ({ searchValue, labels, onSelect }: CreateLabelType) => {
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
          <Button className="w-full" variant={'outlineGhost'} size={'xs'}>
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
  accordionValue: string;
  setAccordionValue: (newValue: string) => void;
};

const LabelsListItem = ({ value, label, color, accordionValue, setAccordionValue, onSubmit, onDelete, onSelect, isActive }: LabelsItem) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = React.useState<string>(label);
  const [colorValue, setColorValue] = React.useState<string>(color);
  const disabled = label === inputValue && color === colorValue;

  React.useEffect(() => {
    if (accordionValue === value) inputRef.current?.focus();
  }, [accordionValue, value]);

  return (
    <>
      <Accordion key={value} type="single" collapsible value={accordionValue} onValueChange={setAccordionValue}>
        <AccordionItem value={value}>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-">
              <Check className={cn('h-4 w-4', isActive ? 'opacity-100' : 'opacity-0')} />
              <Button size={'micro'} variant={'none'} onClick={onSelect}>
                <Badge variant="outline" style={badgeStyle(color)}>
                  {label}
                </Badge>
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <AccordionTrigger>Edit</AccordionTrigger>
              <Button onClick={onDelete} variant="destructive" size="micro">
                Delete
              </Button>
            </div>
          </div>
          <AccordionContent>
            <form
              className="flex ml-1 items-end gap-4"
              onSubmit={(e) => {
                onSubmit(e);
                setAccordionValue('');
              }}
            >
              <div className="w-full gap-3 grid">
                <Label htmlFor="name">Label name</Label>
                <Input
                  ref={inputRef}
                  id="name"
                  value={inputValue}
                  onChange={(e: { target: { value: React.SetStateAction<string> } }) => setInputValue(e.target.value)}
                  className="h-7"
                />
              </div>
              <div className="gap-3 grid">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  type="color"
                  value={colorValue}
                  onChange={(e: { target: { value: React.SetStateAction<string> } }) => setColorValue(e.target.value)}
                  className="h-7 px-2 py-1"
                />
              </div>
              <Button type="submit" disabled={disabled} size="micro">
                Save
              </Button>
            </form>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
