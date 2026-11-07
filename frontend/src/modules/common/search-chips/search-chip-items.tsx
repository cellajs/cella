import { useTranslation } from 'react-i18next';
import type { SearchChip } from '~/modules/common/search-chips/types';
import { Button } from '~/modules/ui/button';
import { Chip, type ChipSize } from '~/modules/ui/chip';
import { cn } from '~/utils/cn';

const filterChipClass = 'border-transparent bg-foreground-soft text-background [&_button]:hover:bg-background/20 [&_button]:hover:text-background';
const pickingChipClass = 'outline-2 outline-foreground-soft outline-offset-1';

interface FilterChipProps {
  chip: SearchChip;
  isPicking?: boolean;
  onPress?: () => void;
  size?: ChipSize;
  className?: string;
}

/** A filter's value as a chip; pressing it, when given `onPress`, offers the filter's other values. */
export function FilterChip({ chip, isPicking = false, onPress, size, className }: FilterChipProps) {
  const { t } = useTranslation();

  return (
    <Chip
      size={size}
      start={chip.start && <span className={cn('flex *:size-6', size === 'lg' && '*:size-7')}>{chip.start}</span>}
      onRemove={chip.onRemove}
      removeLabel={t('c:remove_resource', { resource: chip.label })}
      onPress={onPress}
      pressLabel={t('c:change_resource', { resource: chip.label })}
      isExpanded={isPicking}
      className={cn('max-w-48', filterChipClass, isPicking && pickingChipClass, className)}
    >
      <span className="flex items-center gap-1 [&_svg]:size-3.5 [&_svg]:shrink-0">
        {chip.icon}
        {chip.label}
      </span>
    </Chip>
  );
}

interface WordChipProps {
  text: string;
  onPress: () => void;
  onRemove: () => void;
  size?: ChipSize;
  className?: string;
}

/** A finished search word as a chip; pressing it edits the word. */
export function WordChip({ text, onPress, onRemove, size, className }: WordChipProps) {
  const { t } = useTranslation();

  return (
    <Chip
      {...{ size, onRemove, onPress }}
      removeLabel={t('c:remove_resource', { resource: text })}
      pressLabel={t('c:edit_resource', { resource: text })}
      className={cn('max-w-48 *:data-[slot=chip-value]:cursor-text', className)}
    >
      {text}
    </Chip>
  );
}

interface MoreChipsButtonProps {
  count: number;
  size?: ChipSize;
  onPress: () => void;
  className?: string;
}

/** The "+N" of a one-line chips row, for the chips it hides. */
export function MoreChipsButton({ count, size, onPress, className }: MoreChipsButtonProps) {
  const { t } = useTranslation();

  return (
    <Button
      variant="secondary"
      size="xs"
      aria-label={t('c:counted_more', { count })}
      // Focus comes with the click: a press that shows the hidden chips would land the click on the one in its place
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={cn('w-9 shrink-0 rounded-full px-0 tabular-nums', size === 'lg' ? 'h-7' : 'h-6', className)}
    >
      +{count}
    </Button>
  );
}
