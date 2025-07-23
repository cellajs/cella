import { EntitySeeder } from './entity-seeder';
import { type InsertUserModel } from '#/db/schema/users';
import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';
import slugify from 'slugify';
import { UniqueEnforcer } from 'enforce-unique';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { config } from 'config';
import { pastIsoDate } from './past-iso-date';
import { hashPassword } from '#/modules/auth/helpers/argon2id';

// A simple type representing a user's first and last name.
type FirstAndLastName = { firstName: string; lastName: string };

/**
 * Seeder for generating unique user records with realistic data.
 * Supports async initialization to prepare default hashed passwords.
 * Uses uniqueness enforcers to avoid duplicate emails and slugs.
 */
export class UserSeeder extends EntitySeeder<InsertUserModel> {
  private static defaultPassword = '12345678';
  private static defaultHashedPassword: string;

  private slugEnforcer = new UniqueEnforcer();
  private emailEnforcer = new UniqueEnforcer();

  private hashedPassword: string;

  /**
   * Creates a new instance of the user seeder with a predefined hashed password.
   * @param hashedPassword - The password to assign to each user record.
   */
  constructor(hashedPassword: string) {
    super();
    this.hashedPassword = hashedPassword;
  }

  /**
   * Asynchronously initializes a UserSeeder instance.
   * If no password is provided, it hashes and caches a default password for reuse.
   * @param password - Optional raw password to hash and use for all users.
   * @returns A ready-to-use UserSeeder instance.
   */
  static async init(password?: string): Promise<UserSeeder> {
    if (!this.defaultHashedPassword) {
      this.defaultHashedPassword = await hashPassword(this.defaultPassword);
    }

    const hashed = password ? await hashPassword(password) : this.defaultHashedPassword;
    return new UserSeeder(hashed);
  }

  /**
   * Generates a unique email address for a user.
   * Enforces uniqueness internally to avoid duplicates.
   * @param firstAndLastName - The name object used to build the email.
   * @returns A unique and realistic-looking email address.
   */
  private email(firstAndLastName: FirstAndLastName): string {
    return this.emailEnforcer.enforce(() =>
      faker.internet.email(firstAndLastName).toLocaleLowerCase()
    );
  }

  /**
   * Generates a unique slug (username) for a user.
   * Ensures the slug is unique with retry and timeout options.
   * @param firstAndLastName - The name object used to build the slug.
   * @returns A unique slug string.
   */
  private slug(firstAndLastName: FirstAndLastName): string {
    return this.slugEnforcer.enforce(
      () => slugify(faker.internet.username(firstAndLastName), { lower: true, strict: true }),
      {
        maxTime: 500,
        maxRetries: 500,
      }
    );
  }

  /**
   * Generates a random first and last name pair.
   * @returns An object containing `firstName` and `lastName`.
   */
  private firstAndLastName(): FirstAndLastName {
    return {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
  }

  /**
   * Creates a single user record with unique and realistic data.
   * @returns A complete InsertUserModel object for database insertion.
   */
  make(): InsertUserModel {
    const firstAndLastName = this.firstAndLastName();
    const email = this.email(firstAndLastName);

    return {
      id: nanoid(),
      firstName: firstAndLastName.firstName,
      lastName: firstAndLastName.lastName,
      thumbnailUrl: null,
      language: config.defaultLanguage,
      name: faker.person.fullName(firstAndLastName),
      email,
      unsubscribeToken: generateUnsubscribeToken(email),
      hashedPassword: this.hashedPassword,
      slug: this.slug(firstAndLastName),
      newsletter: faker.datatype.boolean(),
      createdAt: pastIsoDate(),
    };
  }
}