import { z } from '@hono/zod-openapi';
import type { ChannelEntityType } from 'shared';
import type { NotificationTypePolicy } from '#/modules/notification/notification-types';

/**
 * App-owned fields on template wire schemas (pinned). The template ships empty shapes; apps fill
 * them here so their data validates on the wire and reaches the SDK types without editing the
 * template schema files that spread them.
 */

/** Wire schema for `organization.setupConfig`, spread into the organization response and update contract. */
export const setupConfigSchema = z.object({});

/**
 * Extra fields for a channel's `counts` object in the included schema, e.g.
 * `milestones: z.object({...}).optional()`, optional when only some operations populate them. Keep
 * the return a plain object literal (no ZodRawShape annotation) so the counts schema keeps exact
 * field inference for SDK generation.
 */
export const appChannelCountFields = (_entityType: ChannelEntityType) => ({});

/**
 * App notification types beyond the template's `mention`, `comment`, `reply` and `edit`
 * (`modules/notification/notification-types.ts`), each with its delivery policy, e.g.
 * `assigned: { email: true, muted: false }`. Every type needs the `c:notification.<type>` and
 * `c:notifications.<type>_email` keys in `app.json`; adding one adds a `<type>_email` preference
 * column (`pnpm generate`).
 */
export const appNotificationTypes = {} as const satisfies Record<string, NotificationTypePolicy>;
