import { useEffect, useState } from 'react';
import { Button } from '~/modules/ui/button';
import { Check, Tag } from 'lucide-react';
import { CommandItem, CommandList, Command, CommandInput, CommandGroup } from '../ui/command.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.tsx';
import { Kbd } from '../common/kbd.tsx';
import { Badge } from '../ui/badge.tsx';
import { useTranslation } from 'react-i18next';

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

const recentLabels = [
  { id: 'blogger', slug: 'sdfsdfsdf', name: 'blogger', color: '#FFD700' },
  { id: 'scientist', slug: 'sdfdsdfsdf', name: 'scientist', color: '#FF6347' },
  { id: 'entrepreneur', slug: 'sdssfsdfsdf', name: 'entrepreneur', color: '#FF4500' },
];

interface SetLabelsProps {
  labels?: Label[];
  mode: 'create' | 'edit';
  changeLabels?: (labels: Label[]) => void;
}

const SetLabels = ({ labels = recentLabels, mode, changeLabels }: SetLabelsProps) => {
  const { t } = useTranslation();
  const [openPopover, setOpenPopover] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState<Label[]>([]);
  const [searchValue, setSearchValue] = useState('');

  const handleSelectClick = (name: string) => {
    if (!name) return;
    const existingLabel = selectedLabels.find((label) => label.name === name);
    if (existingLabel) {
      setSelectedLabels(selectedLabels.filter((label) => label.name !== name));
      return;
    }
    const newLabel = labels.find((label) => label.name === name);
    if (newLabel) {
      setSelectedLabels([...selectedLabels, newLabel]);
      return;
    }
  };

  const isSearching = searchValue.length > 0;

  useEffect(() => {
    if (changeLabels && selectedLabels.length > 0) changeLabels(selectedLabels);
  }, [selectedLabels]);
  return (
    <Popover open={openPopover} onOpenChange={setOpenPopover}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Set labels"
          variant="ghost"
          size={mode === 'create' ? 'sm' : 'micro'}
          className={`flex justify-start font-light ${
            mode === 'create' ? 'w-full text-left border' : 'group-hover/task:opacity-100 opacity-70 hover:bg-transparent'
          }`}
        >
          {!selectedLabels.length && <Tag className="h-4 w-4 opacity-50" />}
          <div className="flex gap-1 truncate">
            {mode === 'create' && selectedLabels.length === 0 && <span className="ml-2">Choose labels</span>}
            {selectedLabels.length > 0 &&
              selectedLabels.map(({ name, slug, color }) => {
                return (
                  <Badge variant="outline" key={slug} className="font-light " style={badgeStyle(color)}>
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
                handleSelectClick(recentLabels[Number.parseInt(searchValue)]?.name);
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
              {recentLabels.map((label, index) => (
                <CommandItem
                  key={label.name}
                  value={label.name}
                  onSelect={(name) => {
                    handleSelectClick(name);
                    setSearchValue('');
                  }}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center gap-3">
                    <span>{label.name}</span>
                  </div>
                  <div className="flex items-center">
                    {selectedLabels.includes(label) && <Check size={16} className="text-success" />}
                    {!isSearching && <span className="max-xs:hidden text-xs opacity-50 ml-3 mr-1">{index}</span>}
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

export default SetLabels;
