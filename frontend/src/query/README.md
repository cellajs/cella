# Key Concepts in Application Design with TanStack Query

## Why TanStack Query?

TanStack Query simplifies server data management by automatically caching responses and refetching data in the background to keep it up-to-date. It also offers easy tools for synchronizing the UI with the server data, ensuring the user interface reflects the latest changes.

Offline mode, TanStack Query stores data locally and queues any mutations, such as updates or deletions. When the device is back online, it automatically syncs these changes with the backend. This ensures data consistency even when the device switches between online and offline states.

Sync mode, ensures easy synchronization across multiple devices. This feature helps maintain consistency across a user's devices, ensuring that they always have the latest version of the data.

## 1. Key Factories

Key factories are an effective way to standardize and manage query keys, especially when you want easy support or the ability to change query keys across your application.

**Purpose**: You can centralize the logic for query keys, which simplifies both fetching and mutating queries.

**Example**: It would look something like this:

```ts
export const attachmentsKeys = {
  all: ["attachments"] as const,
  list: () => [...attachmentsKeys.all, "list"] as const,
  table: (filters?: GetAttachmentsParams) => [...attachmentsKeys.list(), filters] as const,
  similar: (filters?: Pick<GetAttachmentsParams, "orgIdOrSlug">) => [...attachmentsKeys.list(), filters] as const,
  create: () => [...attachmentsKeys.all, "create"] as const,
  update: () => [...attachmentsKeys.all, "update"] as const,
  delete: () => [...attachmentsKeys.all, "delete"] as const
};
```

## 2. Query Options

Creating a query options function alongside your query key factories is a great way to ensure your data fetching configuration is consistent and easy to manage.

**Purpose**: This function would allow you to standardize settings for things like caching, refetching, pagination, and more, making it easier to maintain and adjust the behavior of your queries across the app.

### Required Query Options

- **queryKey**:  
  This is used to uniquely identify and cache the query. It is hashed into a stable hash value, ensuring consistent and reliable caching behavior. When the `queryKey` changes (if `enabled` is set to true), the query will automatically update.
- **queryFn**:  
  The query function responsible for fetching the data. It receives a `QueryFunctionContext` and must return a promise that resolves with the requested data. If an error occurs, it should throw an error. The returned data cannot be undefined.

- **getNextPageParam** _(only in infinite query)_:  
  This function is required when working with infinite queries. When new data is received for this query, it receives the last page of the infinite list of data, the full array of all pages, and information about the page parameters.  
  It should return a single variable that will be passed as the last optional parameter to your query function.  
  The function signature is:  
  `(lastPage, allPages, lastPageParam, allPageParams) => TPageParam | undefined | null`  
  If there is no next page available, return `undefined` or `null` to indicate so.

**Query options Example**:

```ts
export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: organizationsKeys.single(idOrSlug),
    queryFn: () => getOrganization(idOrSlug)
  });
```

**Infinite query options Example**:

```ts
// Build query to get attachments with infinite scroll
export const attachmentsQueryOptions = ({ orgIdOrSlug, q = "", sort: initialSort, order: initialOrder, limit = LIMIT }: GetAttachmentsParams) => {
  const sort = initialSort || "createdAt";
  const order = initialOrder || "desc";

  const queryKey = attachmentsKeys.table({ orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getAttachments({ page, q, sort, order, limit, orgIdOrSlug, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length
  });
};
```

## 3. Optimistic Updates

Optimistic updates are a technique that immediately updates the UI, assuming a change will succeed before the server response is received. This approach enhances the user experience by making the app feel more responsive.

**Purpose**: Enable offline operation by immediately updating the UI. When connectivity is restored, the app syncs changes with the backend, ensuring consistency or rolling back on errors.

**Example**: In a to-do list app, when a user marks an item as completed, the UI is updated instantly (crossing off the item), even before the server confirms the action.

```ts
const { mutate } = useMutation(markTodoCompleted, {
  onMutate: async (variables) => {
    // Optimistically update the UI
    await queryClient.cancelQueries(["todos"]);
    queryClient.setQueryData(["todos"], (oldData) => {
      return oldData.map((todo) => (todo.id === variables.id ? { ...todo, completed: true } : todo));
    });
  },
  onError: (err, variables, context) => {
    // Roll back to previous state in case of error
    queryClient.setQueryData(["todos"], context.previousTodos);
  }
});
```

### Why Some Queries Use Optimistic Updates

Some queries use optimistic updates because they involve changes that can occur in offline mode. This ensures that users can continue interacting with the app without noticeable delays, and any discrepancies between the local changes and server state can be resolved automatically or with minimal user intervention.
