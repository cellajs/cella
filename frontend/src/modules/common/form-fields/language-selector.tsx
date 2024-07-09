'use client';
import { config } from 'config';
import { Check, ChevronDown } from 'lucide-react';
import { type LegacyRef, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useMeasure } from '~/hooks/use-measure';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '~/modules/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import CountryFlag from '../country-flag';

type Language = { value: string; label: string };

const languages: Language[] = config.languages;

export const SelectLanguages = ({ onChange }: { onChange: (value: string[]) => void }) => {
  const { t } = useTranslation();
  const { ref, bounds } = useMeasure();

  const { getValues } = useFormContext();
  const formValue = getValues('languages');
  const [open, setOpen] = useState(false);

  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(Array.isArray(formValue) ? formValue : []);

  const toggleLanguageSelection = (language: string) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(language)) return prev.filter((lang) => lang !== language);
      return [...prev, language];
    });
  };

  useEffect(() => {
    setSelectedLanguages(Array.isArray(formValue) ? formValue : []);
  }, [formValue]);

  useEffect(() => {
    onChange(selectedLanguages);
  }, [selectedLanguages]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref as LegacyRef<HTMLButtonElement>}
          variant="input"
          aria-label="Select language"
          className="w-full justify-between font-normal"
          aria-expanded={open}
        >
          {selectedLanguages.length > 0 ? (
            <div className="flex items-center flex-nowrap truncate">
              {selectedLanguages.map((lang, index) => {
                const language = languages.find((l) => l.value === lang);
                if (!language) return null;
                return (
                  <span key={lang} className="flex items-center mr-2 flex-nowrap truncate">
                    <CountryFlag countryCode={language.value} imgType="png" className="mr-2 shrink-0" />
                    <span className="truncate">{language.label}</span>
                    {index !== selectedLanguages.length - 1 && <span className="ml-1">,</span>}
                  </span>
                );
              })}
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
              {languages.map((language) => (
                <CommandItem
                  key={language.value}
                  value={language.value}
                  onSelect={() => toggleLanguageSelection(language.value)}
                  className="group rounded-md flex justify-between items-center w-full leading-normal"
                >
                  <div className="flex items-center flex-nowrap truncate">
                    <CountryFlag countryCode={language.value} imgType="png" className="mr-2 shrink-0" />
                    <span className="truncate">{language.label}</span>
                  </div>
                  {selectedLanguages.includes(language.value) && <Check className="h-4 w-4 text-success" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
export const SelectLanguage = ({
  name,
  onChange,
  disabledItemFunction,
}: { name: string; onChange: (value: string) => void; disabledItemFunction?: (value: string) => boolean }) => {
  const { t } = useTranslation();

  const { getValues } = useFormContext();
  const formValue = getValues(name);
  const [open, setOpen] = useState(false);

  const [selectedLanguage, setSelectedLanguage] = useState<string>(formValue || '');

  useEffect(() => {
    setSelectedLanguage(formValue as string);
  }, [formValue]);

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      onValueChange={(lang: string) => {
        setSelectedLanguage(lang);
        onChange(lang);
      }}
      value={selectedLanguage}
    >
      <SelectTrigger aria-expanded={open} className="w-full">
        <SelectValue placeholder={t('common:placeholder.select_language')} />
      </SelectTrigger>
      <SelectContent>
        {languages.map((language: Language) => (
          <SelectItem key={language.value} value={language.value} disabled={disabledItemFunction?.(language.value)} className="truncate">
            <CountryFlag countryCode={language.value} imgType="png" className="mr-2 shrink-0" />
            <span className="truncate">{language.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
