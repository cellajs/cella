# Query implementation notes

Read [React Client](../../../cella/CLIENT.md) first for the state model, startup sequence, and persistence boundaries. This note records the storage lifecycle query code relies on.

The frontend uses one IndexedDB database per real user, named `${appConfig.slug}:${userId}`. It opens once a user is known, rebinds on account switch, and is unavailable while signed out. Consumers resolve the live instance through `getLocalUserDb()` and tolerate `null`.

The lifecycle is auth-driven, not route-driven. The bootstrap user store hydrates from `localStorage`, so `localUserDb` and its per-user Zustand stores hydrate before the authenticated route connects the stream. Explicit sign-out deletes the database; an involuntary session loss only closes it, preserving offline work for the same user after reauthentication.

Eager hydration starts before `_app beforeLoad`, so `localUserStorageReady()` can gate the stream on a populated sync cursor. Impersonation is ephemeral and opens no durable storage for the impersonated user.
