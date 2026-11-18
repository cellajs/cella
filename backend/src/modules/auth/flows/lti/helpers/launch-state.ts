import { z } from '@hono/zod-openapi';
import { maxLength } from '#/db/utils/constraints';

/**
 * What the login hands the launch page through the platform: the nonce it stored, the frame that holds its value and
 * the connection whose platform answers there. The page trusts none of it; the finish checks the launch itself.
 */
const launchStateSchema = z.object({ nonce: z.uuid(), target: z.string().min(1).max(maxLength.field), connection: z.uuid() });

export type LaunchState = z.infer<typeof launchStateSchema>;

/** The `state` of an authentication request, opaque to the platform. */
export const encodeLaunchState = (state: LaunchState) => Buffer.from(JSON.stringify(state)).toString('base64url');

/** The state a launch posts back; undefined for one the login never made. */
export const decodeLaunchState = (value: string | undefined): LaunchState | undefined => {
  if (!value) return undefined;
  try {
    return launchStateSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    return undefined;
  }
};

/** The platform storage key the login puts the nonce's value under. */
export const ltiStorageKey = (nonce: string) => `lti_nonce_${nonce}`;
