// App channel-path resolver seam (pinned; apps own their registration): apps with nested channels
// call `registerChannelPathResolver` (view-declaration.ts) with a resolver reading the
// server-computed `path` off cached channel rows; cella's single-channel hierarchy registers none.
export {};
