import { Check, ChevronsUpDown, Edit2 } from 'lucide-react';
import * as React from 'react';

import { DialogClose } from '@radix-ui/react-dialog';
import { cn } from '~/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/modules/ui/alert-dialog';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandSeparator } from '~/modules/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { PopoverPortal } from '@radix-ui/react-popover';
import { CommandList } from 'cmdk';
import { ScrollArea } from '../ui/scroll-area';

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

export interface LabelBoxData {
  boxOpen?: boolean;
}
export function LabelBox({ boxOpen = false }: LabelBoxData) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [labels, setLabels] = React.useState<LabelType[]>(Labels);
  const [openCombobox, setOpenCombobox] = React.useState(false);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [inputValue, setInputValue] = React.useState<string>('');
  const [selectedValues, setSelectedValues] = React.useState<LabelType[]>(Labels);
  const [accordionValue, setAccordionValue] = React.useState<string>('');

  const createLabel = (name: string) => {
    const newLabel = {
      value: name.toLowerCase(),
      label: name,
      color: '#ffffff',
    };
    setLabels((prev) => [...prev, newLabel]);
    setSelectedValues((prev) => [...prev, newLabel]);
  };

  const toggleLabel = (label: LabelType) => {
    setSelectedValues((currentLabels) =>
      !currentLabels.includes(label) ? [...currentLabels, label] : currentLabels.filter((l) => l.value !== label.value),
    );
    inputRef?.current?.focus();
  };

  const updateLabel = (Label: LabelType, newLabel: LabelType) => {
    setLabels((prev) => prev.map((f) => (f.value === Label.value ? newLabel : f)));
    setSelectedValues((prev) => prev.map((f) => (f.value === Label.value ? newLabel : f)));
  };

  const deleteLabel = (Label: LabelType) => {
    setLabels((prev) => prev.filter((f) => f.value !== Label.value));
    setSelectedValues((prev) => prev.filter((f) => f.value !== Label.value));
  };

  const onComboboxOpenChange = (value: boolean) => {
    inputRef.current?.blur(); // HACK: otherwise, would scroll automatically to the bottom of page
    setOpenCombobox(value);
  };
  return (
    <>
      <Popover open={openCombobox} onOpenChange={onComboboxOpenChange}>
        {boxOpen && (
          <PopoverTrigger asChild>
            <Button
              size={'xs'}
              variant="outlineGhost"
              role="combobox"
              aria-expanded={openCombobox}
              className="w-[200px] justify-between text-foreground"
            >
              <span className="truncate">
                {selectedValues.length === 0 && 'Select labels'}
                {selectedValues.length === 1 && selectedValues[0].label}
                {selectedValues.length === 2 && selectedValues.map(({ label }) => label).join(', ')}
                {selectedValues.length > 2 && `${selectedValues.length} labels selected`}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        )}
        <PopoverPortal>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput
                ref={inputRef}
                placeholder="Search label..."
                value={inputValue}
                setZeroValue={setInputValue}
                onValueChange={setInputValue}
              />
              <CommandGroup>
                <ScrollArea className="h-[150px] overflow-y-auto">
                  {labels.map((label) => {
                    const isActive = selectedValues.includes(label);
                    return (
                      <CommandList>
                        <CommandItem className="mr-1" key={label.value} value={label.value} onSelect={() => toggleLabel(label)}>
                          <Check className={cn('mr-2 h-4 w-4', isActive ? 'opacity-100' : 'opacity-0')} />
                          <div className="flex-1">{label.label}</div>
                          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: label.color }} />
                        </CommandItem>
                      </CommandList>
                    );
                  })}
                </ScrollArea>
                <CommandItemCreate onSelect={() => createLabel(inputValue)} {...{ inputValue, labels }} />
              </CommandGroup>
              <CommandSeparator alwaysRender />
              <CommandGroup>
                <CommandList>
                  <CommandItem
                    value={`:${inputValue}:`} // HACK: that way, the edit button will always be shown
                    className="text-xs text-muted-foreground"
                    onSelect={() => setOpenDialog(true)}
                  >
                    <div className={cn('mr-2 h-4 w-4')} />
                    <Edit2 className="mr-2 h-2.5 w-2.5" />
                    Edit Labels
                  </CommandItem>
                </CommandList>
              </CommandGroup>
            </Command>
          </PopoverContent>
        </PopoverPortal>
      </Popover>

      <Dialog
        open={openDialog}
        onOpenChange={(open: boolean) => {
          setOpenDialog(open);
        }}
      >
        <DialogContent className="max-w-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Labels</DialogTitle>
            <DialogDescription>Change the label names or delete the labels. Create a label through the combobox though.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[25vh] overflow-auto">
            <div className=" -mx-3.5 px-6 flex-1 py-2">
              {labels.map((label) => (
                <DialogListItem
                  onDelete={() => deleteLabel(label)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const target = e.target as typeof e.target & Record<'name' | 'color', { value: string }>;
                    const newLabel = {
                      value: target.name.value.toLowerCase(),
                      label: target.name.value,
                      color: target.color.value,
                    };
                    updateLabel(label, newLabel);
                  }}
                  accordionValue={accordionValue}
                  setAccordionValue={setAccordionValue}
                  {...label}
                />
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="bg-opacity-40">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {!boxOpen && (
        <div className="relative flex align-center justify-start overflow-y-auto gap-1 ">
          {selectedValues.map(({ label, value, color }) => (
            <button
              type="button"
              onClick={() => {
                setOpenDialog(true);
                setAccordionValue(value);
              }}
            >
              <Badge key={value} variant="outline" style={badgeStyle(color)}>
                {label}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const CommandItemCreate = ({
  inputValue,
  labels,
  onSelect,
}: {
  inputValue: string;
  labels: LabelType[];
  onSelect: () => void;
}) => {
  const hasNoLabel = !labels.some((label) => label.value === inputValue.toLowerCase());
  const render = inputValue !== '' && hasNoLabel;
  if (!render) return null;

  // BUG: whenever a space is appended, the Create-Button will not be shown.
  return (
    <>
      {inputValue && hasNoLabel && (
        <CommandItem key={inputValue} value={inputValue} className="text-xs text-muted-foreground" onSelect={onSelect}>
          <div className={cn('mr-2 h-4 w-4')} />
          Create new label &quot;{inputValue}&quot;
        </CommandItem>
      )}
    </>
  );
};

const DialogListItem = ({
  value,
  label,
  color,
  onSubmit,
  onDelete,
  accordionValue,
  setAccordionValue,
}: LabelType & {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  accordionValue: string;
  setAccordionValue: (newValue: string) => void;
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = React.useState<string>(label);
  const [colorValue, setColorValue] = React.useState<string>(color);
  const disabled = label === inputValue && color === colorValue;

  React.useEffect(() => {
    if (accordionValue === value) inputRef.current?.focus();
  }, [accordionValue, value]);

  return (
    <Accordion key={value} type="single" collapsible value={accordionValue} onValueChange={setAccordionValue}>
      <AccordionItem value={value}>
        <div className="flex justify-between items-center">
          <div>
            <Badge variant="outline" style={badgeStyle(color)}>
              {label}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <AccordionTrigger>Edit</AccordionTrigger>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                {/* REMINDER: size="xs" */}
                <Button variant="destructive" size="xs">
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You are about to delete the label{' '}
                    <Badge variant="outline" style={badgeStyle(color)}>
                      {label}
                    </Badge>{' '}
                    .
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                className="h-8"
              />
            </div>
            <div className="gap-3 grid">
              <Label htmlFor="color">Color</Label>
              <Input
                id="color"
                type="color"
                value={colorValue}
                onChange={(e: { target: { value: React.SetStateAction<string> } }) => setColorValue(e.target.value)}
                className="h-8 px-2 py-1"
              />
            </div>
            <Button type="submit" disabled={disabled} size="xs">
              Save
            </Button>
          </form>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
