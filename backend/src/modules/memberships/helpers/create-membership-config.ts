import { membershipsTable } from "../../../db/schema/memberships";
import type { OrganizationModel } from "../../../db/schema/organizations";
import type { ProjectModel } from "../../../db/schema/projects";

/**
 * This file provides an abstraction layer for supporting different entities
 * where users can be invited to.
 * 
 * It can be extended with more models to support additional entities.
 */

/**
 * Supported types for membership context.
 */
export type supportedModelTypes = OrganizationModel | ProjectModel;

/**
 * Array of supported entity types.
 */
export const supportedEntityTypes = ['PROJECT', 'ORGANIZATION'];

/**
 * Get the memberships table ID based on the context.
 * @param context The context for which the memberships table ID is needed.
 * @returns The ID of the memberships table column corresponding to the context.
 */
export const membershipsTableId = (context: supportedModelTypes) => {
    if (context.entity === 'PROJECT') return membershipsTable.projectId;
    return membershipsTable.organizationId;
}