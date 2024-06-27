
# Seed Scripts Overview

1. User seed (required)
This script seeds the database with an admin user.

Admin User: Creates an admin user with a verified email(admin-test@cellajs.com) and password 12345678.

2. Organizations seed
This script seeds the database with organizations, users and memberships.

- Organizations: Generates 10 unique organizations.
- Users: Creates 100 users for each organization.
- Memberships: Associates users with their respective organizations.
- Admin User: Adds an admin user to every even organization.

3. Data seed
This is an app-specific seed. Currently, this script seeds additional data: workspaces, projects, tasks and labels.

4. Pivotal seed
App-specific seed to migrate data from pivotal to cella.

```
pnpm seed:pivotal -- --file '/Users/flip/pivotal-cella.zip' --project wppoiso9icl77yyb4n519
```