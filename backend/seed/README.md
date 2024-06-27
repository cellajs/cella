
# Seed Scripts Overview

1. user seed (required)
This script seeds the database with an admin user.

Admin User: Creates an admin user with a verified email(admin-test@cellajs.com) and a predefined password(12345678).

2. organizations seed
This script seeds the database with organizations, users, and memberships.

- Organizations: Generates 10 unique organizations.
- Users: Creates 100 users for each organization.
- Memberships: Associates users with their respective organizations.
- Admin User: Adds an admin user to every even organization.

3. data seed
This is an app-specific seed. Currently, this script seeds additional data for organizations, workspaces, projects, tasks, and labels.

Workspaces: Creates 5 workspaces for each organization.
Memberships: Assigns 10 users to each workspace and adds an admin user to every even workspace.
Projects: Creates 3 projects for each workspace and assigns them to the workspace.
Tasks: Generates 50 tasks for each project.
Labels: Creates 5 labels for each project.
Admin User: Adds an admin user to every even project in every even workspace.

# Usage

1. Ensure your database configuration is correctly set up in the config file. This includes connection details and other relevant settings.
2. Run Seed Scripts: Start with user seed, then organizations seed, and then your app-specific seed if it exists.