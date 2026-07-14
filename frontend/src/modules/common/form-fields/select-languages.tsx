import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type Language } from 'shared';
import { useMeasure } from '~/hooks/use-measure';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { Button } from '~/modules/ui/button';

interface SelectLanguagesProps {
  value: Language[];
  onChange: (value: Language[]) => void;
}

interface SelectLanguagesContentProps extends Pick<SelectLanguagesProps, 'onChange'> {
  initialValue: Language[];
  triggerWidth?: number;
}

/**
 * Dropdowner content for multi-selecting languages.
 * Maintains local state because dropdowner renders a snapshot.
 */
function SelectLanguagesContent({ initialValue, onChange, triggerWidth = 240 }: SelectLanguagesContentProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Language[]>(initialValue);

  const options = appConfig.languages.map((lang) => ({ value: lang, label: t(`c:${lang}`) }));

  const toggleLanguage = (language: Language) => {
    if (selected.includes(language) && selected.length === 1) return;
    const next = selected.includes(language) ? selected.filter((l) => l !== language) : [...selected, language];
    setSelected(next);
    onChange(next);
  };

  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      className="relative overflow-hidden rounded-lg sm:w-(--trigger-width)"
      style={{ '--trigger-width': `${triggerWidth}px` } as CSSProperties}
    >
      <div className="max-h-[30vh] overflow-y-auto p-1">
        {options.map((option) => (
          <div
            key={option.value}
            role="option"
            aria-selected={selected.includes(option.value)}
            className="relative flex cursor-pointer select-none items-center justify-between rounded-md px-2 py-1.5 text-sm leading-normal outline-hidden hover:bg-accent hover:text-accent-foreground"
            onClick={() => toggleLanguage(option.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleLanguage(option.value);
              }
            }}
            tabIndex={0}
          >
            <div className="flex flex-nowrap items-center truncate">
              <span className="truncate">{option.label}</span>
            </div>
            <CheckIcon strokeWidth={3} className={`text-success ${!selected.includes(option.value) && 'invisible'}`} />
          </div>
        ))}
      </div>
    </div>
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
      className="w-full justify-between font-normal data-dropdowner-active:ring-1 data-dropdowner-active:ring-ring"
      onClick={openDropdown}
    >
      {value.length > 0 ? (
        <div className="flex flex-nowrap items-center truncate">
          {value.map((lang, index) => (
            <span key={lang} className="mr-2 flex flex-nowrap items-center truncate">
              <span className="truncate">{t(`c:${lang}`)}</span>
              {index !== value.length - 1 && <span className="ml-1">,</span>}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">{t('c:placeholder.select_languages')}</span>
      )}
      <ChevronDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
    </Button>
  );
};
