# Middlewares
A short introduction into the most important middleware as they are crucial for fast and secure development.

### Guard
Guard is where you protect and secure endpoints with middleware. There are currently four options. Except for isPublicAccess, the other three can and should be combined and isAuthenticated always needs to be the first one. For example a `middleware` for an endpoint could be: `[isAuthenticated, isAllowedTo('delete', 'organization'), isSystemAdmin]`

* isPublicAccess
* isAuthenticated
* isAllowedTo
* isSystemAdmin

### Rate limiter

### Logger


