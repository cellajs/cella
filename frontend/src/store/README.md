# Store
We use some stores for resources that are shared or subscribed to across the entire app.

## Good to know
* Zustand is used
* Some stores persist on sessionStorage, others on localStorage
* Keep the store clean. Use `storeName.subscribe` to listen to changes.
* Pay attention to versioning. If we change a value or the data structure, we should bump the version up.


#### Subscribe example 
```
  useUserStore.subscribe((state) => {
    const user: User = state.user;

    if (user) return setSomething(user)
      
    // Clear user on sign out
    unsetSomething()
  });
```


#### Versioning example:

```
export const useBoundStore = create(
  persist(
    (set, get) => ({
      newField: 0, // let's say this field was named otherwise in version 0
    }),
    {
      // ...
      version: 1, // a migration will be triggered if the version in the storage mismatches this one
      migrate: (persistedState, version) => {
        if (version === 0) {
          // if the stored value is in version 0, we rename the field to the new name
          persistedState.newField = persistedState.oldField
          delete persistedState.oldField
        }

        return persistedState
      },
    },
  ),
)
```


More info: 
<https://docs.pmnd.rs/zustand/integrations/persisting-store-data>

