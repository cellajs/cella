import { EntitySeeder } from './entity-seeder';
import { type InsertOrganizationModel } from '#/db/schema/organizations';
import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';
import slugify from 'slugify';
import { UniqueEnforcer } from 'enforce-unique';
import { pastIsoDate } from './past-iso-date';

// A complete record for inserting a new organization, including a unique ID.
type OrganizationRecord = InsertOrganizationModel & { id: string };

/**
 * Seeder for generating unique organization records with realistic data.
 * Extends EntitySeeder to provide concrete implementations.
 */
export class OrganizationSeeder extends EntitySeeder<OrganizationRecord> {
  private nameEnforcer = new UniqueEnforcer();

/**
 * Generates a unique organization name.
 * Ensures no duplicates using an internal uniqueness enforcer.
 * @returns A unique company name string.
 */
  name(): string {
    return this.nameEnforcer.enforce(() => faker.company.name());
  }

/**
 * Creates a single unique `OrganizationRecord` populated with realistic data.
 * Uses internal methods and libraries to ensure data integrity and uniqueness.
 * @returns A new `OrganizationRecord` ready for insertion into the database.
 */
  make(): OrganizationRecord {
    const name = this.name();
    return {
      id: nanoid(),
      name,
      slug: slugify(name, { lower: true, strict: true }),
      bannerUrl: null,
      color: faker.color.rgb(),
      chatSupport: faker.datatype.boolean(),
      country: faker.location.country(),
      createdAt: pastIsoDate(),
      logoUrl: faker.image.url(),
      thumbnailUrl: null,
    };
  }
}