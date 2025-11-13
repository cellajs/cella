import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtualizer } from 'virtua';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import { useMeasure } from '~/hooks/use-measure';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { Button } from '~/modules/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';

interface ComboBoxOption {
  value: string;
  label: string;
  url?: string | null;
}

export interface ComboboxProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (newValue: string) => void;
  renderOption?: (option: ComboBoxOption) => React.ReactNode;
  renderAvatar?: boolean;
  contentWidthMatchInput?: boolean;
  disabled?: boolean;
  placeholders?: {
    trigger?: string;
    search?: string;
    notFound?: string;
  };
}

const Combobox = ({
  options,
  value,
  onChange,
  renderOption = ({ label }) => <span className="truncate">{label}</span>,
  renderAvatar = false,
  contentWidthMatchInput = true,
  disabled = false,
  placeholders: passedPlaseholders = {},
}: ComboboxProps) => {
  const { t } = useTranslation();
  const isMobile = useBreakpoints('max', 'sm');

  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedOption, setSelectedOption] = useState<ComboBoxOption | null>(options.find((o) => o.value === value) || null);

  const { ref, bounds } = useMeasure<HTMLButtonElement>();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const debouncedSearchQuery = useDebounce(searchValue, 300);

  const placeholders = {
    trigger: t('common:select'),
    search: t('common:placeholder.search'),
    notFound: t('common:no_resource_found', { resource: t('common:item').toLowerCase() }),
    ...passedPlaseholders,
  };

  const filteredOptions = useMemo(
    () => options.filter(({ label }) => label.toLowerCase().includes(debouncedSearchQuery.toLowerCase())),
    [options, debouncedSearchQuery],
  );

  const handleSelect = (newResult: string) => {
    const result = options.find((o) => o.label === newResult);
    if (!result) return;
    setSelectedOption(result);
    onChange(result.value);
    setOpen(false);
    setSearchValue('');
  };

  // Whenever the form value changes (also on reset), update the internal state
  useEffect(() => {
    const selected = options.find((o) => o.value === value);
    setSelectedOption(selected || null);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="input"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full justify-between truncate font-normal"
          disabled={disabled}
        >
          {selectedOption ? (
            <div className="flex items-center truncate gap-2">
              {renderAvatar && (
                <AvatarWrap className="h-6 w-6 text-xs shrink-0" id={selectedOption.value} name={selectedOption.label} url={selectedOption.url} />
              )}
              {renderOption(selectedOption)}
            </div>
          ) : (
            <span className="truncate text-muted-foreground">{placeholders.trigger}</span>
          )}
          <ChevronDownIcon className={`ml-2 size-4 shrink-0 opacity-50 transition-transform ${open ? '-rotate-90' : 'rotate-0'}`} />
        </Button>
      </PopoverTrigger>
      {/* bounds.width + bounds.x * 2 to also include padding */}
      {/* TODO has scaling effect issue */}
      <PopoverContent align="start" style={{ width: contentWidthMatchInput ? `${bounds.width}px` : '100%' }} className="p-0">
        <Command shouldFilter={false}>
          {!isMobile && (
            <CommandInput value={searchValue} onValueChange={setSearchValue} clearValue={setSearchValue} placeholder={placeholders.search} />
          )}

          <CommandList className="h-[30vh]">
            <CommandEmpty>
              <ContentPlaceholder icon={SearchIcon} title={placeholders.notFound} />
            </CommandEmpty>

            <CommandGroup>
              {/* To avoid conflicts between ScrollArea and Virtualizer, do not set a max-h value on ScrollArea. 
              As this will cause all list elements to render at once in Virtualizer*/}
              <ScrollArea className="h-[30vh]" viewportRef={scrollViewportRef}>
                <ScrollBar />

                <Virtualizer as="ul" item="li" scrollRef={scrollViewportRef}>
                  {filteredOptions.map((option, index) => (
                    <CommandItem
                      key={`${option.value}-${index}`}
                      value={option.label}
                      onSelect={handleSelect}
                      className="group rounded-md flex justify-between items-center w-full leading-normal"
                    >
                      <div className="flex items-center gap-2">
                        {/* Not show awatar if name of component in exclude list */}
                        {renderAvatar && <AvatarWrap id={option.value} name={option.label} url={option.url} />}
                        {renderOption(option)}
                      </div>
                      <CheckIcon size={16} strokeWidth={3} className={`text-success ${value !== option.value && 'invisible'}`} />
                    </CommandItem>
                  ))}
                </Virtualizer>
              </ScrollArea>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default Combobox;
