import { useState } from 'react';
import type { SearchChip, SearchOption, SearchOptionGroup } from '~/modules/common/search-chips/types';

/** Which filter chip is pressed to change its value, and what its filter offers for that. */
export function useChipPicking(chips: SearchChip[], groups: SearchOptionGroup[]) {
  const [pickingKey, setPickingKey] = useState<string | null>(null);

  const groupOf = (chip?: SearchChip) => groups.find((group) => group.key === chip?.group);
  const pickingChip = chips.find((chip) => chip.key === pickingKey);

  // The chip can go from under the choice, such as by a reset or the back button
  if (pickingKey && !pickingChip) setPickingKey(null);

  return {
    pickingKey,
    setPickingKey,
    pickingChip,
    pickingGroup: groupOf(pickingChip),
    hasAlternatives: (chip: SearchChip) => !!groupOf(chip)?.options.some((option) => !option.isSelected),
    /** Swaps the pressed chip's value for the option, and without a pressed chip toggles the option. */
    applyOption: (group: SearchOptionGroup, option: SearchOption) => {
      if (group.onReplace && pickingChip?.value) group.onReplace(pickingChip.value, option.value);
      else group.onToggle(option.value);
    },
  };
}
