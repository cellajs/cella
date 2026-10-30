import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { SegmentedControl, SegmentedControlItem } from '~/modules/ui/segmented-control';

export interface ViewToggleMode<T extends string> {
  value: T;
  icon: IconComponent;
  label: TKey;
}

interface ViewToggleProps<T extends string> {
  modes: readonly ViewToggleMode<T>[];
  className?: string;
}

/** Switches the page's `view` search param; the route validates it and strips its default from the URL. */
export function ViewToggle<T extends string>({ modes, className }: ViewToggleProps<T>) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const view = useSearch({ strict: false, select: (search: Record<string, unknown>) => search.view });
  const active = modes.find((mode) => mode.value === view) ?? modes[0];

  const handleValueChange = (value: T) => {
    // Each route types its own `view` values, which a mode of any toggle cannot name
    const update: Record<string, string> = { view: value };
    navigate({ to: '.', resetScroll: false, search: (prev) => ({ ...prev, ...update }) });
  };

  return (
    <SegmentedControl aria-label={t('c:view_mode')} className={className} value={active.value} onValueChange={handleValueChange}>
      {modes.map((mode) => (
        <TooltipButton key={mode.value} toolTipContent={t(mode.label)}>
          <SegmentedControlItem value={mode.value}>
            <mode.icon />
          </SegmentedControlItem>
        </TooltipButton>
      ))}
    </SegmentedControl>
  );
}
