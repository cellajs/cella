import { useEffect, useState } from 'react';
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
import { cn } from '~/lib/utils.ts';

export type Label = {
  id: string;
  slug: string;
  name: string;
  color: string;
};

const badgeStyle = (color: string) => ({
  borderColor: `${color}40`,
  color,
});

interface SetLabelsProps {
  passedLabels: Label[];
  mode: 'create' | 'edit';
  changeLabels?: (labels: Label[]) => void;
}

const SetLabels = ({ mode, passedLabels, changeLabels }: SetLabelsProps) => {
  const { t } = useTranslation();
  const formValue = useFormContext?.()?.getValues('labels');
  const [openPopover, setOpenPopover] = useState(false);
  const [innerLabels, setInnerLabels] = useState<Label[]>(passedLabels);
  const [selectedLabels, setSelectedLabels] = useState<Label[]>(mode === 'create' ? [] : passedLabels);
  const [searchValue, setSearchValue] = useState('');
  const isSearching = searchValue.length > 0;

  const handleSelectClick = (name: string) => {
    if (!name) return;
    const existingLabel = selectedLabels.find((label) => label.name === name);
    if (existingLabel) {
      setSelectedLabels(selectedLabels.filter((label) => label.name !== name));
      return;
    }
    const newLabel = innerLabels.find((label) => label.name === name);
    if (newLabel) {
      setSelectedLabels([...selectedLabels, newLabel]);
      return;
    }
  };

  const createLabel = (name: string) => {
    const newLabel: Label = {
      id: faker.string.uuid(),
      slug: name.toLowerCase(),
      name,
      color: '#ffffff',
    };
    setInnerLabels((prev) => [...prev, newLabel]);
    setSelectedLabels((prev) => [...prev, newLabel]);
    setSearchValue('');
    changeLabels?.([...innerLabels, newLabel]);
  };

  // Open on key press
  useHotkeys([['l', () => setOpenPopover(true)]]);

  // callback to change labels in task card
  useEffect(() => {
    if (changeLabels && selectedLabels.length > 0) changeLabels(selectedLabels);
  }, [selectedLabels]);

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    setSelectedLabels(formValue || mode === 'create' ? [] : passedLabels);
  }, [formValue]);

  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Set labels"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'micro'}
          className={`flex justify-start font-light ${mode === 'create' ? 'w-full text-left border' : 'group-hover/task:opacity-100 opacity-70'} ${
            mode === 'edit' && selectedLabels.length && 'hover:bg-transparent'
          }`}
        >
          {!selectedLabels.length && <Tag className="h-4 w-4 opacity-50" />}
          <div className="flex gap-1 truncate">
            {mode === 'create' && selectedLabels.length === 0 && <span className="ml-2">Choose labels</span>}
            {selectedLabels.length > 0 &&
              selectedLabels.map(({ name, slug, color }) => {
                return (
                  <Badge variant="outline" key={slug} className="font-light" style={badgeStyle(color)}>
                    {name}
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
              if ([0, 1, 2, 3, 4, 5, 6].includes(Number.parseInt(searchValue))) {
                handleSelectClick(passedLabels[Number.parseInt(searchValue)]?.name);
                setOpenPopover(false);
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
              {passedLabels.map((mappedLabel, index) => (
                <CommandItem
                  key={mappedLabel.name}
                  value={mappedLabel.name}
                  onSelect={(name) => {
                    handleSelectClick(name);
                    setSearchValue('');
                  }}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center gap-2">
                    {isSearching ? <Dot size={16} style={badgeStyle(mappedLabel.color)} strokeWidth={8} /> : <History size={16} />}
                    <span>{mappedLabel.name}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedLabels.includes(mappedLabel) && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandItemCreate onSelect={() => createLabel(searchValue)} {...{ searchValue, labels: passedLabels }} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SetLabels;

const CommandItemCreate = ({
  searchValue,
  labels,
  onSelect,
}: {
  searchValue: string;
  labels: Label[];
  onSelect: () => void;
}) => {
  const hasNoLabel = !labels.map(({ slug }) => slug).includes(`${searchValue.toLowerCase()}`);

  const render = searchValue !== '' && hasNoLabel;

  if (!render) return null;

  // BUG: whenever a space is appended, the Create-Button will not be shown.
  return (
    <CommandItem key={`${searchValue}`} value={`${searchValue}`} className="text-xs text-muted-foreground" onSelect={onSelect}>
      <div className={cn('mr-2 h-4 w-4')} />
      Create new label &quot;{searchValue}&quot;
    </CommandItem>
  );
};
