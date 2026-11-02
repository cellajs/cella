import { useTranslation } from 'react-i18next';
import type { SearchChip } from '~/modules/common/search-chips/types';
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
      data-search-chip={chip.key}
      size={size}
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
      data-search-chip={`word:${text}`}
      size={size}
      onRemove={onRemove}
      removeLabel={t('c:remove_resource', { resource: text })}
      onPress={onPress}
      pressLabel={t('c:edit_resource', { resource: text })}
      className={cn('max-w-48 *:data-[slot=chip-value]:cursor-text', className)}
    >
      {text}
    </Chip>
  );
}
