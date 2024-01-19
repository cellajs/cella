import { Argon2id } from 'oslo/password';

import { db } from '../src/db/db';
import { usersTable } from '../src/db/schema';
import { nanoid } from '../src/lib/nanoid';

const hashedPassword = await new Argon2id().hash('12345678');

await db.insert(usersTable).values({
  id: nanoid(),
  email: 'admin-test@cellajs.com',
  slug: 'admin-user',
  role: 'ADMIN',
  hashedPassword,
});

console.log('Created user: admin');

process.exit(0);
