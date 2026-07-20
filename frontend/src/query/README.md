# Query implementation notes

Read [React Client](../../../cella/CLIENT.md) first for the state model, startup sequence, and persistence boundaries. This local note records the storage lifecycle used by query code.

The frontend uses one IndexedDB database per real user, named `${appConfig.slug}:${userId}`. It opens after a user is known, rebinds on account switch, and is unavailable while signed out. Consumers resolve the live instance through `getAppDb()` and tolerate `null`.

The lifecycle is auth-driven rather than route-driven. The bootstrap user store hydrates from `localStorage`, allowing `appdb` to open and its per-user Zustand stores to hydrate before the authenticated route connects the stream. Explicit sign-out deletes the database. An involuntary session loss only closes it, preserving offline work for the same user after reauthentication.

Eager hydration starts before `_app beforeLoad`, so `appStorageReady()` can gate the stream on a populated sync cursor. Impersonation is ephemeral and does not open durable storage for the impersonated user.
