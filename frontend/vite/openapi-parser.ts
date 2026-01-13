/**
 * OpenAPI Parser Plugin for API Documentation
 *
 * This file re-exports from the refactored module structure for backwards compatibility.
 * The actual implementation is in ./openapi-parser/
 *
 * @see ./openapi-parser/plugin.ts - Main plugin implementation
 * @see ./openapi-parser/helpers/ - Pure helper functions (testable)
 */

// Re-export everything from the new module structure
export * from './openapi-parser/index';
export { default } from './openapi-parser/index';
