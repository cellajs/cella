import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { cn } from '~/lib/utils';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from './scroll-area';
import CountryFlag from '../common/country-flag';

type TimeZone = {
  value: string;
  abbr: string;
  offset: number;
  isdst: boolean;
  text: string;
  utc: string[];
};

type Country = { name: string; code: string };

interface ComboboxProp {
  data: Country[] | TimeZone[];
  value: string;
  placeholder?: string;
  searchPlaceholder?: string;
  onChange: (newValue: string) => void;
}

export function Combobox({ data, value, placeholder, searchPlaceholder, onChange }: ComboboxProp) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [innerValue, setInnerValue] = React.useState(value);
  const [searchValue, setSearchValue] = React.useState('');

  const handleSelect = (newValue: string) => {
    setInnerValue(newValue);
    onChange(newValue);
    setOpen(false);
    setSearchValue('');
  };

  const isCountryArray = (data: Country[] | TimeZone[]): data is Country[] => {
    return data[0] && 'name' in data[0];
  };

  const renderOptions = () => {
    if (isCountryArray(data)) {
      return data.map((country) => (
        <CommandItem
          key={country.code}
          value={country.name}
          onSelect={handleSelect}
          className="group rounded-md flex justify-between items-center w-full leading-normal"
        >
          <div>
            <CountryFlag countryCode={country.code} imgType="png" className="mr-2" />
            {country.name}
          </div>

          <Check size={16} className={cn('text-success', value === country.name ? 'opacity-100' : 'opacity-0')} />
        </CommandItem>
      ));
    }
    return data.map((timezone) => (
      <CommandItem
        key={timezone.value}
        value={timezone.value}
        onSelect={handleSelect}
        className="group rounded-md flex justify-between items-center w-full leading-normal"
      >
        {timezone.text}
        <Check size={16} className={cn('text-success', value === timezone.value ? 'opacity-100' : 'opacity-0')} />
      </CommandItem>
    ));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          <div>
            {isCountryArray(data) && <CountryFlag countryCode={data.find((c) => c.name === innerValue)?.code || ''} imgType="png" className="mr-2" />}
            {innerValue.length > 0 ? innerValue : placeholder || ''}
          </div>
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
            placeholder={searchPlaceholder || t('common:search')}
          />
          <ScrollArea className="max-h-[30vh] overflow-auto">
            <CommandList>
              <CommandEmpty>No such {isCountryArray(data) ? 'country' : 'timezone'} found.</CommandEmpty>
              <CommandGroup>{renderOptions()}</CommandGroup>
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
