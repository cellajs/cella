
# Seed Scripts Overview

### User seed (required)
This script seeds the database with an admin user:

* email: admin-test@cellajs.com
* password: 12345678

### Organizations seed
This script seeds the database with organizations, users and memberships.

- Organizations: Generates 10 unique organizations.
- Users: Creates 100 users for each organization.
- Memberships: Associates users with their respective organizations.
- Admin User: Adds an admin user to every even organization.

### Data seed
This is an app-specific seed. Currently, this script seeds additional data: workspaces, projects, tasks and labels.

### Pivotal seed
App-specific seed to migrate data from pivotal to cella.

```
pnpm backend seed:pivotal -- --file '/Users/flip/Sites/cella/pivotal-cella.zip' --project vu9mbeo6yl4v59psfjc8t
```