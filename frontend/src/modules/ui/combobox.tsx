import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Virtualizer } from 'virtua';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMeasure } from '~/hooks/use-measure';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { Button } from '~/modules/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { ScrollArea } from '~/modules/ui/scroll-area';

interface ComboBoxOption {
  value: string;
  label: string;
  url?: string | null;
}

interface ComboboxProps {
  options: ComboBoxOption[];
  name: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  renderOption?: (option: ComboBoxOption) => React.ReactNode;
  contentWidthMatchInput?: boolean;
  disabled?: boolean;
}

const Combobox: React.FC<ComboboxProps> = ({
  options,
  name,
  onChange,
  placeholder,
  searchPlaceholder,
  renderOption,
  contentWidthMatchInput,
  disabled,
}) => {
  const { t } = useTranslation();
  const formValue = useFormContext()?.getValues(name);
  const isMobile = useBreakpoints('max', 'sm');
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const { ref, bounds } = useMeasure<HTMLButtonElement>();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedOption, setSelectedOption] = useState<ComboBoxOption | null>(options.find((o) => o.value === formValue) || null);

  const excludeAvatarWrapFields = ['timezone', 'country'];

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
    const selected = options.find((o) => o.value === formValue);
    setSelectedOption(selected || null);
  }, [formValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="input"
          // biome-ignore lint/a11y/useSemanticElements: <explanation>
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between truncate font-normal"
          disabled={disabled}
        >
          {selectedOption ? (
            <div className="flex items-center truncate gap-2">
              {!excludeAvatarWrapFields.includes(name) && (
                <AvatarWrap className="h-6 w-6 text-xs shrink-0" id={selectedOption.value} name={name} url={selectedOption.url} />
              )}
              {renderOption?.(selectedOption) ?? <span className="truncate">{selectedOption.label}</span>}
            </div>
          ) : (
            <span className="truncate">{placeholder || t('common:select')}</span>
          )}
          <ChevronDown className={`ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform ${open ? '-rotate-90' : 'rotate-0'}`} />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" style={{ width: contentWidthMatchInput ? `${bounds.width}px` : '100%' }} className="p-0">
        <Command>
          {!isMobile && (
            <CommandInput
              value={searchValue}
              onValueChange={setSearchValue}
              clearValue={setSearchValue}
              placeholder={searchPlaceholder || t('common:search')}
            />
          )}

          <CommandList>
            <CommandEmpty>
              <ContentPlaceholder Icon={Search} title={t('common:no_resource_found', { resource: t(`common:${name}`).toLowerCase() })} />
            </CommandEmpty>

            <CommandGroup>
              <ScrollArea viewPortRef={scrollViewportRef} className="max-h-[30vh] overflow-y-auto">
                <Virtualizer as="ul" item="li" scrollRef={scrollViewportRef} overscan={1}>
                  {options
                    .filter(({ label }) => label.toLowerCase().includes(searchValue.toLowerCase()))
                    .map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={handleSelect}
                        className="group rounded-md flex justify-between items-center w-full leading-normal"
                      >
                        <div className="flex items-center gap-2">
                          {!excludeAvatarWrapFields.includes(name) && <AvatarWrap id={option.value} name={name} url={option.url} />}
                          {renderOption?.(option) ?? option.label}
                        </div>
                        <Check size={16} className={`text-success ${formValue !== option.value && 'invisible'}`} />
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
