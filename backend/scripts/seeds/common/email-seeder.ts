import { type UserModel } from '#/db/schema/users';
import { type InsertEmailModel } from '#/db/schema/emails';
import { RelationSeeder } from './relation-seeder';
import { pastIsoDate } from './past-iso-date';

/**
 * Seeder class for generating verified email records linked to users.
 * Extends a generic RelationSeeder to create one or multiple email relations.
 */
export class EmailSeeder extends RelationSeeder<InsertEmailModel> {
  /**
 * Creates a single verified email record for a given user.
 * @param user - The user model to create an email record for.
 * @returns A new `InsertEmailModel` representing the verified email.
 */
  make(user: UserModel): InsertEmailModel {
    return {
      email: user.email,
      userId: user.id,
      verified: true,
      verifiedAt: pastIsoDate(),
    };
  }

  /**
   * Creates multiple verified email records for an array of users.
   * @param users - Array of user models to create email records for.
   * @returns An array of `InsertEmailModel` objects representing verified emails.
   */
  makeMany(users: UserModel[]): InsertEmailModel[] {
    return users.map(user => this.make(user));
  }
}