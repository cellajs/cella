import type { ProductEntityType } from 'shared';

/**
 * Products the notifications seed mentions the admin in (app-owned): the newest rows homed in channels the admin
 * belongs to, each mentioned by another member of that channel. An empty list seeds no inbox.
 */
export const seedMentionEntityTypes: ProductEntityType[] = ['attachment'];
