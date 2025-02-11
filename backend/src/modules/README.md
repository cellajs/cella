# Backend modules
Each module has a similar setup: `routes`, `schema`, a `hc` hono client and the business logic in the `handlers` file. To keep it DRY and/or to prevent large files, some blocks of code can be put in a `helpers` folder. Write your app-specific code into new modules to make updates from cella smoother.

### Core modules
* attachments
* auth
* general
* me
* memberships
* metrics
* organizations
* requests
* users
