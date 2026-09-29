import { toSafeRedirectPath } from 'shared/utils/safe-redirect-path';

/** A redirect target that stays on this origin (the shared redirect rules), or undefined. */
export const safeRedirectPath = (value: unknown) =>
  toSafeRedirectPath(value, { origin: window.location.origin }) ?? undefined;
