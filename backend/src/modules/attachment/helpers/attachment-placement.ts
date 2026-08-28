import type { AuthContext } from '#/core/context';

/**
 * Create-body placement fields, spread into the create-item schema. This file is the attachment
 * placement seam: cella homes attachments at the organization only, so it exposes no fields and
 * resolves every row org-homed. An app that re-homes attachments on its channel chain (nullable
 * ancestor columns, deepest non-null = home) replaces this file; the cella-owned schema and
 * create op call through the seam, so the swap stays local to it.
 */
export const attachmentPlacementFieldsSchema = {};

/** A create-body item as the placement seam sees it; apps narrow to their placement fields. */
export type AttachmentPlacementInput = Record<string, unknown>;

/** Ancestor id columns to stamp on the inserted row; empty = org-homed. */
export type ResolvedAttachmentPlacement = Record<string, string | null>;

/**
 * Per-item create-body validation, anchored at the returned path relative to the item. Apps
 * reject ambiguous placement here (more than one home id per item); with no placement fields
 * there is nothing to reject.
 */
export const validateAttachmentPlacement = (
  _item: AttachmentPlacementInput,
): { path: (string | number)[]; message: string } | null => null;

/**
 * Ancestor columns for one create-body item; the org-homed default stamps none. Apps resolve
 * the most specific client-sent id to a real row (requiring read access on it) and derive the
 * chain above it server-side, never from client input.
 */
export const resolveAttachmentPlacement = async (
  _ctx: AuthContext,
  _input: AttachmentPlacementInput,
): Promise<ResolvedAttachmentPlacement> => ({});
