import { useIsFetching } from '@tanstack/react-query';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { SearchChipsField } from '~/modules/common/search-chips/search-chips-field';
import type { SearchChipsFieldProps } from '~/modules/common/search-chips/types';
import { cn } from '~/utils/cn';

type OwnedProps = 'isSearching' | 'disabled' | 'hideClear' | 'edgeless' | 'compactOnPhone' | 'isCountInField';

interface TableBarSearchProps extends Omit<SearchChipsFieldProps, OwnedProps> {
  isFiltered: boolean;
  /** Keeps the search open offline, for a list filtered in the client. */
  allowOfflineSearch?: boolean;
}

/**
 * The search of a bar that keeps its count beside the action: framed by the bar, as wide as the row's free room up to
 * one width. Below `lg` it rests small and takes the row in use or filtering, the line under the bar clears it, and the
 * typed word's row carries the count.
 */
export function TableBarSearch({ isFiltered, allowOfflineSearch = false, resultCount, className, ...props }: TableBarSearchProps) {
  const isCompact = useBreakpointBelow('lg');
  const isOnline = useOnlineManager();
  const isFetching = useIsFetching() > 0;

  return (
    <SearchChipsField
      {...props}
      // From `lg` up the count beside the action stays in view
      resultCount={isCompact ? resultCount : undefined}
      isSearching={isFetching && isFiltered}
      disabled={!isOnline && !allowOfflineSearch}
      hideClear={isCompact}
      compactOnPhone
      edgeless
      className={cn(
        'w-full sm:max-w-56 sm:max-lg:data-in-use:max-w-none lg:max-w-96 xl:max-w-md',
        isCompact && isFiltered && 'sm:max-w-none',
        className,
      )}
    />
  );
}
