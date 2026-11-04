import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { InlineSearchChips } from '~/modules/common/search-chips/inline-search-chips';
import { PhoneSearchChips } from '~/modules/common/search-chips/phone-search-chips';
import type { SearchChipsFieldProps } from '~/modules/common/search-chips/types';

/** A search where every word and filter is its own chip with its own X: options inside the field from `sm` up, a dialog on a phone. */
export function SearchChipsField(props: SearchChipsFieldProps) {
  const isMobile = useBreakpointBelow('sm');
  return isMobile ? <PhoneSearchChips {...props} /> : <InlineSearchChips {...props} />;
}
