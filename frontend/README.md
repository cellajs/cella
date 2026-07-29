# frontend

React SPA built with Vite. Uses TanStack Router for routing, Zustand for state management, and TanStack Query for data fetching. Runs as part of `pnpm dev`.

## Source style

Declare named React components with functions. Component wrappers use a named function expression:

```tsx
export function ProjectTile(props: ProjectTileProps) {
  return <article>{props.name}</article>;
}

export const MemoizedProjectTile = memo(function MemoizedProjectTile(props: ProjectTileProps) {
  return <article>{props.name}</article>;
});
```

Do not annotate component declarations with `React.FC` or `FC`. Use `ComponentType<Props>` when a component is passed or stored as a value.

Add a concise JSDoc description above every exported function and constant. Keep frontend descriptions to one or two sentences.

Local comments explain non-obvious constraints or reasoning. Do not narrate assignments, branches, render structure, or repeated operations. Put one comment above a repetitive block when the block has a shared constraint.
