/**
 * Shared configuration for Artillery load tests.
 *
 * All constants used across scenarios are defined here.
 * Entity IDs and helpers are imported from generators/ids.ts (single source of truth).
 */
import { TENANT_ID, ORG_ID, PROJECT_IDS, userId, userEmail, taskId, attachmentId } from './generators/ids';

export { TENANT_ID, ORG_ID, PROJECT_IDS, userId, userEmail, taskId, attachmentId };

export const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'raak-development-session-v1';
