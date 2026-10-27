// Re-export the shared engine entry point so backend and yjs call the identical function.
export { checkAccess, checkAccessBatch, checkAccessFanout } from 'shared';
