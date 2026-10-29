import { CheckIcon } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type Language } from 'shared';
import { useMeasure } from '~/hooks/use-measure';
import { useInDropdownerDrawer } from '~/modules/common/dropdowner/drawer';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { InputTriggerButton } from '~/modules/common/form-fields/input-trigger-button';
import { SelectDrawerRows } from '~/modules/common/form-fields/select-drawer';

interface SelectLanguagesProps {
  value: Language[];
  onChange: (value: Language[]) => void;
  /** The trigger's id, for a label's `htmlFor`: a click on that label opens the list. */
  id?: string;
}

interface SelectLanguagesContentProps extends Pick<SelectLanguagesProps, 'onChange'> {
  initialValue: Language[];
  triggerWidth?: number;
}

/** Keeps local state because the dropdowner renders a snapshot of its content. */
function SelectLanguagesContent({ initialValue, onChange, triggerWidth = 240 }: SelectLanguagesContentProps) {
  const { t } = useTranslation();
  const inDrawer = useInDropdownerDrawer();
  const [selected, setSelected] = useState<Language[]>(initialValue);

  const options = appConfig.languages.map((lang) => ({
    value: lang,
    label: (
      <span className="truncate" lang={lang}>
        {t(`c:${lang}`)}
      </span>
    ),
  }));

  const toggleLanguage = (language: Language) => {
    if (selected.includes(language) && selected.length === 1) return;
    const next = selected.includes(language) ? selected.filter((lang) => lang !== language) : [...selected, language];
    setSelected(next);
    onChange(next);
  };

  if (inDrawer) return <SelectDrawerRows options={options} selected={selected} onSelect={toggleLanguage} />;

  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      className="max-h-[30vh] overflow-y-auto rounded-lg p-1 sm:w-(--trigger-width)"
      style={{ '--trigger-width': `${triggerWidth}px` } as CSSProperties}
    >
      {options.map((option) => (
        <div
          key={option.value}
          role="option"
          aria-selected={selected.includes(option.value)}
          className="group/language-option flex cursor-pointer select-none items-center justify-between rounded-md px-2 py-1.5 text-sm leading-normal outline-hidden hover:bg-accent hover:text-accent-foreground active:bg-accent aria-selected:font-medium"
          onClick={() => toggleLanguage(option.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleLanguage(option.value);
            }
          }}
          tabIndex={0}
        >
          {option.label}
          <CheckIcon className="invisible text-success group-aria-selected/language-option:visible" />
        </div>
      ))}
    </div>
  );
}

export function SelectLanguages({ value, onChange, id }: SelectLanguagesProps) {
  const { t } = useTranslation();
  const { ref: triggerRef, bounds } = useMeasure<HTMLButtonElement>();

  const openDropdown = () => {
    dropdowner.getState().create(<SelectLanguagesContent initialValue={value} onChange={onChange} triggerWidth={bounds.width} />, {
      id: 'select-languages',
      triggerId: 'select-languages',
      triggerRef,
    });
  };

  return (
    <InputTriggerButton
      ref={triggerRef}
      id={id}
      disabled={appConfig.languages.length < 2}
      aria-label={`${t('c:placeholder.select_languages')}: ${value.map((lang) => t(`c:${lang}`)).join(', ')}`}
      className="w-full data-dropdowner-active:ring-1 data-dropdowner-active:ring-ring"
      onClick={openDropdown}
    >
      {value.length > 0 ? (
        <div className="flex items-center truncate">
          {value.map((lang, index) => (
            <span key={lang} className="mr-2 flex items-center truncate">
              <span className="truncate" lang={lang}>
                {t(`c:${lang}`)}
              </span>
              {index !== value.length - 1 && ','}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">{t('c:placeholder.select_languages')}</span>
      )}
    </InputTriggerButton>
  );
}
