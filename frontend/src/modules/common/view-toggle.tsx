import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';

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

  // Null while no option is hovered or focused: the tooltip then names the active view
  const [hovered, setHovered] = useState<ViewToggleMode<T> | null>(null);

  const handleValueChange = (value: string | string[]) => {
    // A deselect of the active item hands '' and matches no mode, so one view stays active
    const next = modes.find((mode) => mode.value === value);
    if (!next) return;
    // Each route types its own `view` values, which a mode of any toggle cannot name
    const update: Record<string, string> = { view: next.value };
    navigate({ to: '.', resetScroll: false, search: (prev) => ({ ...prev, ...update }) });
  };

  return (
    <TooltipButton toolTipContent={t((hovered ?? active).label)}>
      <ToggleGroup
        type="single"
        variant="merged"
        aria-label={t('c:view_mode')}
        className={className}
        value={active.value}
        onValueChange={handleValueChange}
      >
        {modes.map((mode) => (
          <ToggleGroupItem
            key={mode.value}
            value={mode.value}
            aria-label={t(mode.label)}
            onMouseEnter={() => setHovered(mode)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(mode)}
            onBlur={() => setHovered(null)}
          >
            <mode.icon />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </TooltipButton>
  );
}
