# Query Persistence Notes

The frontend uses a single per-user IndexedDB database named `${appConfig.slug}:${userId}`. It opens only after a real user is known, closes on sign-out, and rebinds on account switch. Consumers resolve the live instance through `getAppDb()` and tolerate `null` while signed out.

The appdb lifecycle is auth-driven rather than route-driven. The user store hydrates from localStorage at boot, so the owner can be known cold or offline before `/me`. On sign-in the app opens `appdb` and eagerly rehydrates app kv stores; on sign-out it closes `appdb`; on account switch it closes, reopens, and rehydrates.

Eager hydration starts as soon as the owner is known, before `_app beforeLoad`, so `appStorageReady()` can gate stream connection on a populated sync cursor. Impersonation is ephemeral and does not open the impersonated user's durable database.
