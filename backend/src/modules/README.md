# Backend modules
Each module has a similar setup: `routes`, `schema` and the business logic in the `handlers` file. To keep it DRY and/or to prevent large files, some blocks of code can be put in a `helpers` folder. Write your app-specific code into new modules to make updates from cella smoother. 

We recommend not to delete modules you do not need. Simply don't include in the hono app. Strong decoupling is not yet realized, so many modules can't be decoupled without breaking changes at this moment.

### Core modules
* auth
* entities
* system
* me
* memberships
* organizations
* users

### Optional modules
* attachments
* metrics
* requests
* pages

