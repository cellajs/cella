# Key Concepts in Application Design with TanStack Query

## 1. Key Factories

**Definition**: It's just a simple object with entries and functions that will produce query keys.

**Purpose**: These keys are used to cache, invalidate, refetching, and synchronization across components.

**Example**: It would look something like this:

```ts
const todoKeys = {
  all: ["todos"] as const,
  lists: () => [...todoKeys.all, "list"] as const,
  list: (filters: string) => [...todoKeys.lists(), { filters }] as const,
  details: () => [...todoKeys.all, "detail"] as const,
  detail: (id: number) => [...todoKeys.details(), id] as const
};
```

## 2. Query Options

**Definition**: Query options refer to parameters and configuration options that define how data is fetched, cached, and updated. These options control things like caching, refetching, pagination, etc.

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

**Definition**: Optimistic updates are a technique that immediately updates the UI, assuming a change will succeed before the server response is received. This approach enhances the user experience by making the app feel more responsive, particularly in situations with high network latency or when operating in offline mode.

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

Some queries use optimistic updates because they involve changes that can occur in offline mode. This allows users to continue interacting with the app even without an internet connection, as the UI is updated immediately, assuming the changes will be successfully applied once the connection is restored.
