import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { PhoneSearchChips } from '~/modules/common/search-chips/phone-search-chips';
import { PopupSearchChips } from '~/modules/common/search-chips/popup-search-chips';
import type { SearchChipsFieldProps } from '~/modules/common/search-chips/types';

/** A search where every word and filter is its own chip with its own X: a popup from `sm` up, a dialog on a phone. */
export function SearchChipsField(props: SearchChipsFieldProps) {
  const isMobile = useBreakpointBelow('sm');
  return isMobile ? <PhoneSearchChips {...props} /> : <PopupSearchChips {...props} />;
}
