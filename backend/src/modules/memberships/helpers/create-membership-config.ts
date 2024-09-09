import { membershipsTable } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';

/**
 * This file provides an abstraction layer for supporting different entities
 * where users can be invited to.
 *
 * It can be extended with more models to support additional entities.
 */

/**
 * TODO:generics issue: Supported types for membership context.
 */
export type supportedModelTypes = OrganizationModel;

/**
 * Array of supported entity types.
 */
export const supportedEntityTypes = ['project', 'organization'];

/**
 * Get the memberships table ID based on the context.
 * @param _context The context for which the memberships table ID is needed.
 * @returns The ID of the memberships table column corresponding to the context.
 */
export const membershipsTableId = (_context: supportedModelTypes) => {
  return membershipsTable.organizationId;
};
