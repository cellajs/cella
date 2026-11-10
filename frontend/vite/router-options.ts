/** File-based routing options shared by the Vite plugin and `pnpm generate:routes`, so both write the same tree. */
export const routerOptions = {
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: 'src/routes',
  generatedRouteTree: 'src/routes/routeTree.gen.ts',
  // Helpers beside the routes without the `-` prefix: the router and the generated tree
  routeFileIgnorePattern: '(router\\.ts|routeTree\\.gen\\.ts)$',
} as const;
