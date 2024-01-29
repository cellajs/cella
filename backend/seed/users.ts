import { Argon2id } from 'oslo/password';

import { db } from '../src/db/db';
import { usersTable } from '../src/db/schema';
import { nanoid } from '../src/lib/nanoid';

const main = async () => {
  const hashedPassword = await new Argon2id().hash('12345678');

  await db
    .insert(usersTable)
    .values({
      id: nanoid(),
      email: 'admin-test@cellajs.com',
      emailVerified: true,
      slug: 'admin-user',
      role: 'ADMIN',
      hashedPassword,
    })
    .onConflictDoNothing();

  console.log('Seeded users');

  process.exit(0);
};

main();
