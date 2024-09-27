# Middlewares
A short introduction into the most important middleware as they are crucial for fast and secure development.

### Guard
Guard is where you protect and secure endpoints with middleware. There are currently four options. Except for isPublicAccess, the other three can and should be combined and isAuthenticated always needs to be the first one. For example a `middleware` for an endpoint could be: `[isAuthenticated, isAllowedTo('delete', 'organization'), isSystemAdmin]`

* isPublicAccess: placeholder for public acces. Default rate limit still applies.
* isAuthenticated: user exists and has session.
* hasOrgAccess: organization-scoped entity as an extra safeguard to ensure the user belongs to organization.
* isAllowedTo: the specific action on an entity is allowed and the full parent tree is validated.
* isSystemAdmin: additional security checks to safeguard system admin accounts.

### Rate limiter


### Logger


