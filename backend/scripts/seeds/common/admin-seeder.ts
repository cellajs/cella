import { UserSeeder } from './user-seeder';
import { InsertUserModel } from '#/db/schema/users';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { pastIsoDate } from './past-iso-date';
import { config } from 'config';

/**
 * Seeder for generating a predefined admin user.
 * Extends UserSeeder but overrides `make` to return fixed admin data.
 */
export class AdminSeeder extends UserSeeder {
  private readonly adminId: string;
  private readonly adminEmail: string;
  private readonly adminHashedPassword: string;

  constructor(adminId: string, adminEmail: string, hashedPassword: string) {
    super(hashedPassword);
    this.adminId = adminId;
    this.adminEmail = adminEmail;
    this.adminHashedPassword = hashedPassword;
  }

  /**
   * Overrides make() to return a fixed admin user record.
   * @returns An InsertUserModel for the admin user.
   */
  override make(): InsertUserModel {
    return {
      id: this.adminId,
      firstName: 'Admin',
      lastName: 'User',
      name: 'Admin User',
      slug: 'admin-user',
      role: 'admin',
      email: this.adminEmail,
      unsubscribeToken: generateUnsubscribeToken(this.adminEmail),
      hashedPassword: this.adminHashedPassword,
      language: config.defaultLanguage,
      thumbnailUrl: null,
      newsletter: false,
      createdAt: pastIsoDate(),
    };
  }
}