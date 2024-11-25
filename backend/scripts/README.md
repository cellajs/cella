# Scripts

## Clear db
Clear all data in all tables

## Reset db
Not just clear the database, but also add new mock data

## Seeds

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

