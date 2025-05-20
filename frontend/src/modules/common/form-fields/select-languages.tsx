import { type Language, config } from 'config';
import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeasure } from '~/hooks/use-measure';
import CountryFlag from '~/modules/common/country-flag';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';

interface SelectLanguagesProps {
  value: Language[];
  onChange: (value: Language[]) => void;
}

export const SelectLanguages = ({ value, onChange }: SelectLanguagesProps) => {
  const { t } = useTranslation();
  const { ref, bounds } = useMeasure<HTMLButtonElement>();

  const [open, setOpen] = useState(false);

  const toggleLanguageSelection = (language: Language) => {
    if (value.includes(language)) {
      onChange(value.filter((lang) => lang !== language));
    } else {
      onChange([...value, language]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          disabled={config.languages.length < 2}
          ref={ref}
          variant="input"
          aria-label="Select language"
          className="w-full justify-between font-normal"
          aria-expanded={open}
        >
          {value.length > 0 ? (
            <div className="flex items-center flex-nowrap truncate">
              {value.map((lang, index) => (
                <span key={lang} className="flex items-center mr-2 flex-nowrap truncate">
                  <CountryFlag countryCode={lang} imgType="png" className="mr-2 shrink-0" />
                  <span className="truncate">{t(`common:${lang}`)}</span>
                  {index !== value.length - 1 && <span className="ml-1">,</span>}
                </span>
              ))}
            </div>
          ) : (
            t('common:placeholder.select_languages')
          )}
          <ChevronDown className={`ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform ${open ? '-rotate-90' : 'rotate-0'}`} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0 rounded-lg" style={{ width: `${bounds.left + bounds.right + 2}px` }} align="start" sideOffset={4}>
        <Command className="relative rounded-lg">
          <CommandList>
            <CommandGroup>
              {config.languages.map((lang) => (
                <CommandItem
                  key={lang}
                  value={lang}
                  onSelect={() => toggleLanguageSelection(lang)}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center flex-nowrap truncate">
                    <CountryFlag countryCode={lang} imgType="png" className="mr-2 shrink-0" />
                    <span className="truncate">{t(`common:${lang}`)}</span>
                  </div>
                  <Check size={16} strokeWidth={3} className={`text-success ${!value.some((u) => u === lang) && 'invisible'}`} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
