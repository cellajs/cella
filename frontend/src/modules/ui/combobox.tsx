import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { ScrollArea } from '~/modules/ui/scroll-area';

interface Option {
  value: string;
  shownText: string;
}

interface ComboboxProps {
  options: Option[];
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  renderOption?: (option: Option) => React.ReactNode;
}

const Combobox: React.FC<ComboboxProps> = ({ options, value, onChange, placeholder, searchPlaceholder, renderOption }) => {
  const [open, setOpen] = React.useState(false);
  const [innerValue, setInnerValue] = React.useState(value);
  const [searchValue, setSearchValue] = React.useState('');

  const handleSelect = (newValue: string) => {
    setInnerValue(newValue);
    onChange(newValue);
    setOpen(false);
    setSearchValue('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          {innerValue.length > 0 ? (
            <div>{renderOption ? renderOption({ value: innerValue, shownText: innerValue }) : innerValue}</div>
          ) : (
            placeholder || ''
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-full p-1">
        <Command>
          <CommandInput
            value={searchValue}
            onValueChange={(searchValue) => {
              setSearchValue(searchValue);
            }}
            clearValue={setSearchValue}
            placeholder={searchPlaceholder || ''}
          />
          <ScrollArea className="max-h-[30vh] overflow-auto">
            <CommandList>
              <CommandEmpty>No such option found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={handleSelect}
                    className="group rounded-md flex justify-between items-center w-full leading-normal"
                  >
                    <div>{renderOption ? renderOption(option) : <> {option.shownText}</>}</div>
                    <Check size={16} className={cn('text-success', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default Combobox;
