import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type Language } from 'shared';
import { useMeasure } from '~/hooks/use-measure';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Button } from '~/modules/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '~/modules/ui/command';

interface SelectLanguagesProps {
  value: Language[];
  onChange: (value: Language[]) => void;
}

/**
 * Dropdowner content for multi-selecting languages.
 * Maintains local state because dropdowner renders a snapshot.
 */
function SelectLanguagesContent({
  initialValue,
  onChange,
  triggerWidth = 240,
}: {
  initialValue: Language[];
  onChange: (value: Language[]) => void;
  triggerWidth?: number;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Language[]>(initialValue);
  const [searchValue, setSearchValue] = useState('');

  const allOptions = appConfig.languages.map((lang) => ({ value: lang, label: t(`common:${lang}`) }));
  const filteredOptions = allOptions.filter(({ label }) => label.toLowerCase().includes(searchValue.toLowerCase()));

  const toggleLanguage = (language: Language) => {
    const next = selected.includes(language) ? selected.filter((l) => l !== language) : [...selected, language];
    setSelected(next);
    onChange(next);
  };

  return (
    <Command
      shouldFilter={false}
      className="relative overflow-hidden rounded-lg sm:w-(--trigger-width)"
      style={{ '--trigger-width': `${triggerWidth}px` } as CSSProperties}
    >
      <CommandInput
        value={searchValue}
        onValueChange={setSearchValue}
        clearValue={setSearchValue}
        placeholder={t('common:placeholder.search')}
        wrapClassName="hidden"
        className="leading-normal focus-visible:ring-transparent rounded-none"
      />
      <CommandList className="max-h-[30vh] overflow-y-auto">
        <CommandGroup>
          {filteredOptions.map((option) => (
            <CommandItem
              key={option.value}
              value={option.label}
              onSelect={() => toggleLanguage(option.value)}
              className="group rounded-md flex justify-between items-center w-full leading-normal"
            >
              <div className="flex items-center flex-nowrap truncate">
                <span className="truncate">{option.label}</span>
              </div>
              <CheckIcon
                size={16}
                strokeWidth={3}
                className={`text-success ${!selected.includes(option.value) && 'invisible'}`}
              />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

/**
 * Multi-select dropdowner for choosing one or more languages from the configured app languages.
 */
export const SelectLanguages = ({ value, onChange }: SelectLanguagesProps) => {
  const { t } = useTranslation();
  const { ref: triggerRef, bounds } = useMeasure<HTMLButtonElement>();

  const openDropdown = () => {
    useDropdowner
      .getState()
      .create(<SelectLanguagesContent initialValue={value} onChange={onChange} triggerWidth={bounds.width} />, {
        id: 'select-languages',
        triggerId: 'select-languages',
        triggerRef,
      });
  };

  return (
    <Button
      type="button"
      ref={triggerRef}
      disabled={appConfig.languages.length < 2}
      variant="input"
      aria-label="Select language"
      className="w-full justify-between font-normal data-dropdowner-active:ring-ring data-dropdowner-active:ring-1"
      onClick={openDropdown}
    >
      {value.length > 0 ? (
        <div className="flex items-center flex-nowrap truncate">
          {value.map((lang, index) => (
            <span key={lang} className="flex items-center mr-2 flex-nowrap truncate">
              <span className="truncate">{t(`common:${lang}`)}</span>
              {index !== value.length - 1 && <span className="ml-1">,</span>}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">{t('common:placeholder.select_languages')}</span>
      )}
      <ChevronDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
    </Button>
  );
};
