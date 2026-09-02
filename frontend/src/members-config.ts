import { type LucideIcon, PaperclipIcon } from 'lucide-react';
import type { ChannelEntityType, ProductEntityType } from 'shared';

/**
 * App configuration for the per-member insight columns in the members table. Which product stats
 * exist comes from `appConfig.memberStatProductTypes`; this file decides how they look. Cella ships
 * the attachment paperclip and hides nothing; apps map their own product types here without
 * editing the template's members-columns.
 */
export const memberStatIcons: Partial<Record<ProductEntityType, LucideIcon>> = {
  attachment: PaperclipIcon,
};

/**
 * Count columns (`${type}Count`, product and sub-channel types alike) hidden by default. Users can
 * still toggle them on via the columns view.
 */
export const hiddenMemberCountColumns: readonly (ProductEntityType | ChannelEntityType)[] = [];
