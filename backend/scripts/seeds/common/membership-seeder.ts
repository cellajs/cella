import { type InsertMembershipModel } from '#/db/schema/memberships';
import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';
import { pastIsoDate } from './past-iso-date';
import { UserModel } from '#/db/schema/users';
import { RelationSeeder } from './relation-seeder';
import { config } from 'config';
import { OrganizationModel } from '#/db/schema/organizations';

const ORGANIZATION_ROLES = config.rolesByType.entityRoles;

/**
 * Abstract base class for Membership seeders.
 * Extends RelationSeeder to provide generic membership creation.
 */
abstract class MembershipSeeder extends RelationSeeder<InsertMembershipModel> {
  private static orderMap: Map<string, number> = new Map();

  protected getOrderOffset(contextId: string): number {
    if (!MembershipSeeder.orderMap.has(contextId)) {
      MembershipSeeder.orderMap.set(contextId, MembershipSeeder.orderMap.size + 1);
    }
    return MembershipSeeder.orderMap.get(contextId)!;
  }

  /**
   * Check if the context was added in even position.
   * Useful for special case logic like admin assignment.
   * @param contextId - The context's unique identifier.
   * @returns True if the insertion order for the context is even.
   */
  isEvenOrder(contextId: string): boolean {
    const offset = this.getOrderOffset(contextId);
    return offset % 2 === 0;
  }

  /**
   * Abstract method for generating a membership.
   * Subclasses must implement to provide specific membership context.
   */
  abstract make(user: UserModel, context: any): InsertMembershipModel;

  // Creates memberships for multiple users within a given context.
  makeMany(users: UserModel[], context: any): InsertMembershipModel[] {
    return users.map(user => this.make(user, context));
  }
}

// OrganizationMembershipSeeder creates membership records specific to organizations.
export class OrganizationMembershipSeeder extends MembershipSeeder {
  make(user: UserModel, organization: OrganizationModel): InsertMembershipModel {
    return {
      id: nanoid(),
      userId: user.id,
      organizationId: organization.id,
      contextType: 'organization',
      role: faker.helpers.arrayElement(ORGANIZATION_ROLES),
      order: this.getOrderOffset(organization.id) * 10,
      createdAt: pastIsoDate(),
      activatedAt: pastIsoDate(),
    };
  }
}