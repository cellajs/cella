# Middlewares
A short introduction into the most important middleware as they are crucial for fast and secure development.

### Guard
Guard is where you protect and secure endpoints with middleware. There are currently four options, and you can combine them where it makes sense. isAuthenticated needs to be the first. For example a `middleware` for an endpoint could be: `[isAuthenticated, systemGuard]`

* isPublicAccess: placeholder for public acces. Default rate limit still applies.
* isAuthenticated: user exists and has session. User and memberships are added to `getContext`.
* hasOrgAccess: organization-scoped entity as an extra safeguard to ensure the user belongs to organization.
* systemGuard: additional security checks (isSystemAdmin & ipRestriction) to secure system level activity.

### Rate limiter
Built using [node-rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible#readme). See more info on the rate limit in the index file.

## Token validation
You can use the middleware `validateToken` to validate a token. If its valid (it exists, it is not expired), then it will be added to `getContext`. 

### Logger
Slightly modified version of hono [logger](https://hono.dev/docs/middleware/builtin/logger).
