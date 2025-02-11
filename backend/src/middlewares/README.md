# Middlewares
A short introduction into the most important middleware as they are crucial for fast and secure development. Middleware can be divided in two categories: 1. those added to that app instance directly, and 2. those added per route.

## App wide
Many middleware are directly added to the hono app instance. You can find those in `app.ts`.

### Logger
Slightly modified version of hono [logger](https://hono.dev/docs/middleware/builtin/logger).

## Per route
Below is a list of middleware that can be added per route. Because its important to use them properly, they are explained here in more detail.

### Guard middleware
Guard is a subcategory of per route middleware. The help you protect and secure routes. There are currently four options, and you can combine them where it makes sense. isAuthenticated needs to be the first. For example a `middleware` for a route could be: `[isAuthenticated, hasSystemAccess]`. You need to explicitly decide at least one guard for each route.

* isPublicAccess: placeholder for public access. It is recommended to cache, throttle and/or rate limit these requests.
* isAuthenticated: user exists and has session. User and memberships are added to `getContext`.
* hasOrgAccess: A safeguard to ensure that 1. user belongs to organization and 2. the request is scoped to that organization.
* hasSystemAccess: additional security checks (isSystemAdmin & ipRestriction) to secure system level activity.

### Rate limiter
Built using [node-rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible#readme). See more info on the rate limit in `rate-limiter/core` and in the `limiters` that you can use in your route config.

### Token validation
You can use the middleware `hasValidToken` to validate a token. If its valid (it exists, it is not expired), then it will be added to `getContext`. 
