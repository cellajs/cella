# LMS Integration Plan

This document outlines the architecture and implementation plan for integrating Learning Management Systems (LMS) into Cella, starting with Canvas LMS.

**Architecture decision**: Option C+E (Abstract Base + Request Builder Separation). See [LMS_ARCHITECTURE_OPTIONS.md](./LMS_ARCHITECTURE_OPTIONS.md) for alternatives considered.

## Goals

1. **Canvas-first**: Start with Canvas LMS as the initial provider
2. **Provider-agnostic interface**: Design a generic LMS abstraction that supports multiple providers
3. **Layered architecture**: Clean separation between raw API, transformation, and generic interfaces
4. **Robust HTTP handling**: Rate limiting, pagination, automatic token refresh
5. **Testability**: Each layer independently testable

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LmsClient                                    │
│                   (unified user entry point)                         │
│                                                                      │
│         client.getCourse() → LmsCourse (generic)                    │
│         client.api.getCourse() → CanvasCourse (raw)                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CanvasAdapter                                   │
│              transforms CanvasCourse → LmsCourse                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CanvasApi                                    │
│            Combines RequestBuilder + HttpClient                      │
│                                                                      │
│   getCourse(id) {                                                   │
│     const req = this.builder.getCourse(id)                          │
│     return this.http.execute(req)                                   │
│   }                                                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌─────────────────────────┐     ┌─────────────────────────────────────┐
│  CanvasRequestBuilder   │     │        CanvasHttpClient             │
│                         │     │   extends LmsHttpClientBase         │
│  - knows endpoints      │     │                                     │
│  - knows params         │     │   - Canvas throttle parsing         │
│  - knows body shapes    │     │   - Canvas pagination (Link header) │
│                         │     │   - Canvas error parsing            │
└─────────────────────────┘     └──────────────────┬──────────────────┘
                                                   │
                                                   ▼
                                ┌─────────────────────────────────────┐
                                │        RequestScheduler             │
                                │   (shared per LMS base URL)         │
                                │                                     │
                                │   - Concurrency control             │
                                │   - Request queue                   │
                                │   - Shared throttle state           │
                                └─────────────────────────────────────┘
```

## File Structure

```
backend/src/lib/lms/
├── index.ts                    # createLmsClient(), main exports
├── types.ts                    # Generic LMS interfaces (LmsCourse, LmsUser, etc.)
├── errors.ts                   # LMS-specific error types
├── request-scheduler.ts        # Global request queue, concurrency control
├── http-client-base.ts         # Abstract base class for HTTP clients
├── client.ts                   # LmsClient (unified entry point)
│
└── canvas/
    ├── index.ts                # createCanvasClient(), exports
    ├── types.ts                # Raw Canvas types (CanvasCourse, CanvasUser)
    ├── request-builder.ts      # CanvasRequestBuilder (paths, params, bodies)
    ├── http-client.ts          # CanvasHttpClient extends LmsHttpClientBase
    ├── api.ts                  # CanvasApi (combines builder + http client)
    ├── adapter.ts              # CanvasAdapter (Canvas → Generic)
    └── constants.ts            # Canvas endpoints, limits
```

## Layer Details

The architecture follows Option C+E: Abstract Base + Request Builder Separation.

### Configuration Types

All configuration interfaces for controlling scheduler, throttling, retries, and error handling.

#### Scheduler Configuration

```typescript
interface SchedulerConfig {
  /** Concurrency configuration */
  concurrency?: ConcurrencyConfig
  /** Throttling/rate limit configuration */
  throttling?: ThrottlingConfig
  /** Retry configuration for failed requests */
  retry?: RetryConfig
}

interface ConcurrencyConfig {
  /**
   * Maximum concurrent requests to the LMS instance (default: 10)
   * This is shared across ALL users/clients hitting this LMS.
   */
  maxConcurrent?: number
  /**
   * Maximum queue size before rejecting new requests (default: 1000)
   */
  maxQueueSize?: number
  /**
   * Timeout for waiting in queue in ms (default: 60000)
   * If a request waits longer than this, it's rejected.
   */
  queueTimeout?: number
}
```

#### Throttling Configuration

Canvas uses a cost-based rate limiting system:
- `X-Request-Cost`: The cost of the request (typically 1, bulk operations cost more)
- `X-Rate-Limit-Remaining`: Remaining budget before throttling kicks in
- **429 Too Many Requests**: Returned when rate limit exceeded

```typescript
interface ThrottlingConfig {
  /**
   * What to do when a 429 is received.
   * - 'retry': Wait and retry (default)
   * - 'error': Throw immediately
   */
  onThrottled?: 'retry' | 'error'

  /**
   * Maximum number of retries when throttled (default: 5)
   */
  maxThrottleRetries?: number

  /**
   * Initial delay in ms before first retry after 429 (default: 1000)
   * Subsequent retries use exponential backoff.
   */
  initialDelayMs?: number

  /**
   * Maximum delay between throttle retries in ms (default: 60000)
   */
  maxDelayMs?: number

  /**
   * Backoff multiplier for exponential backoff (default: 2)
   */
  backoffMultiplier?: number

  /**
   * Add random jitter to backoff delays to prevent thundering herd (default: true)
   */
  jitter?: boolean

  /**
   * Proactive throttling: start delaying requests when remaining budget
   * falls below this threshold (default: 50)
   */
  lowBudgetThreshold?: number

  /**
   * Delay to add when budget is low in ms (default: 100)
   */
  lowBudgetDelayMs?: number
}
```

#### Retry Configuration

For handling transient failures (network issues, 5xx errors, timeouts).

```typescript
interface RetryConfig {
  /**
   * Maximum retry attempts for transient failures (default: 3)
   * Set to 0 to disable retries.
   */
  maxRetries?: number

  /**
   * Initial delay before first retry in ms (default: 500)
   */
  initialDelayMs?: number

  /**
   * Maximum delay between retries in ms (default: 10000)
   */
  maxDelayMs?: number

  /**
   * Backoff multiplier (default: 2)
   */
  backoffMultiplier?: number

  /**
   * Which HTTP status codes should trigger a retry (default: [408, 500, 502, 503, 504])
   * 429 is handled separately by throttling config.
   */
  retryableStatusCodes?: number[]

  /**
   * Whether to retry on network errors (ECONNRESET, ETIMEDOUT, etc.) (default: true)
   */
  retryOnNetworkError?: boolean

  /**
   * Whether to retry on timeout (default: true)
   */
  retryOnTimeout?: boolean
}
```

#### Multi-Operation Error Strategy

Unified error handling for pagination, batch GET/POST/PUT/DELETE operations.

```typescript
interface MultiOperationConfig {
  /**
   * How to handle errors during multi-request operations.
   * Applies to: pagination, batch GET/POST/PUT/DELETE
   */
  onError?: MultiOperationErrorStrategy

  /**
   * Maximum errors to collect before stopping (only for 'collect' strategy)
   * Default: 10
   */
  maxCollectedErrors?: number

  /**
   * Callback for each error (useful for logging/monitoring)
   */
  onEachError?: (error: LmsOperationError, context: OperationContext) => void
}

type MultiOperationErrorStrategy =
  /** Stop immediately and throw the error (default) */
  | 'stop'
  /** Collect errors and continue, return results + errors at end */
  | 'collect'
  /** Skip failed operations and continue, log warning */
  | 'skip'

interface OperationContext {
  /** Type of operation */
  operationType: 'pagination' | 'batch-get' | 'batch-post' | 'batch-put' | 'batch-delete'
  /** Index in batch (for batch ops) or page number (for pagination) */
  index: number
  /** Total operations expected (if known) */
  total?: number
  /** The request that failed */
  request: { method: string; path: string; body?: unknown }
}

/** Result for any multi-operation request */
interface MultiOperationResult<T> {
  /** Successfully completed items */
  data: T[]
  /** Errors encountered (populated when strategy is 'collect') */
  errors: LmsOperationError[]
  /** Whether all operations completed successfully */
  complete: boolean
  /** Statistics */
  stats: {
    total: number
    succeeded: number
    failed: number
    skipped: number
  }
}
```

#### HTTP Client Configuration

```typescript
interface HttpClientConfig {
  /** Base URL of the LMS API (e.g., https://institution.instructure.com) */
  baseUrl: string

  /** OAuth2 access token for this user */
  accessToken: string

  /** OAuth2 refresh token for automatic token renewal */
  refreshToken?: string

  /** Callback when tokens are refreshed - use to persist new tokens */
  onTokenRefresh?: (newTokens: TokenPair) => Promise<void>

  /** Multi-operation error strategy (for pagination AND batching) */
  multiOperationStrategy?: MultiOperationConfig

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number

  /** Pagination settings */
  pagination?: PaginationConfig
}

interface PaginationConfig {
  /**
   * Default items per page (default: 100, Canvas allows higher than default 10)
   */
  defaultPerPage?: number

  /**
   * Maximum items per page to request (default: 100)
   */
  maxPerPage?: number
}
```

#### Error Types

```typescript
/** Base LMS error */
class LmsError extends Error {
  constructor(
    message: string,
    public code: LmsErrorCode,
    public statusCode?: number,
    public provider?: LmsProviderType,
    public retryable: boolean = false
  ) {
    super(message)
    this.name = 'LmsError'
  }
}

/** Error from a specific operation in a batch/pagination */
class LmsOperationError extends LmsError {
  constructor(
    message: string,
    code: LmsErrorCode,
    public context: OperationContext,
    statusCode?: number
  ) {
    super(message, code, statusCode)
    this.name = 'LmsOperationError'
  }
}

/** Thrown when rate limit exceeded and all retries exhausted */
class LmsThrottleError extends LmsError {
  constructor(message: string, public retryAfterMs?: number) {
    super(message, 'RATE_LIMITED', 429, undefined, true)
    this.name = 'LmsThrottleError'
  }
}

/** Thrown on network failures */
class LmsNetworkError extends LmsError {
  constructor(message: string, public cause?: Error) {
    super(message, 'NETWORK_ERROR', undefined, undefined, true)
    this.name = 'LmsNetworkError'
  }
}

/** Thrown on request timeout */
class LmsTimeoutError extends LmsError {
  constructor(message: string, public timeoutMs: number) {
    super(message, 'TIMEOUT', undefined, undefined, true)
    this.name = 'LmsTimeoutError'
  }
}

/** Thrown when token refresh fails */
class LmsTokenError extends LmsError {
  constructor(message: string, public tokenErrorType: 'expired' | 'invalid' | 'refresh_failed') {
    super(message, 'TOKEN_ERROR', 401, undefined, false)
    this.name = 'LmsTokenError'
  }
}

/** Thrown when queue is full or timeout waiting for slot */
class LmsQueueError extends LmsError {
  constructor(message: string, public queueSize: number) {
    super(message, 'QUEUE_FULL', undefined, undefined, true)
    this.name = 'LmsQueueError'
  }
}

type LmsErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'TOKEN_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'QUEUE_FULL'
  | 'QUEUE_TIMEOUT'
  | 'OPERATION_FAILED'
```

#### Default Configuration Values

```typescript
const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  concurrency: {
    maxConcurrent: 10,
    maxQueueSize: 1000,
    queueTimeout: 60000,
  },
  throttling: {
    onThrottled: 'retry',
    maxThrottleRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: true,
    lowBudgetThreshold: 50,
    lowBudgetDelayMs: 100,
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableStatusCodes: [408, 500, 502, 503, 504],
    retryOnNetworkError: true,
    retryOnTimeout: true,
  },
}

const DEFAULT_CLIENT_CONFIG = {
  timeout: 30000,
  multiOperationStrategy: {
    onError: 'stop' as const,
    maxCollectedErrors: 10,
  },
  pagination: {
    defaultPerPage: 100,
    maxPerPage: 100,
  },
}
```

---

### Layer 1: Request Scheduler (`request-scheduler.ts`)

Global request queue shared per LMS base URL. Manages concurrency and throttle state across all users.

```typescript
/**
 * Singleton per LMS base URL. All requests to the same LMS go through the same scheduler.
 */
class LmsRequestScheduler {
  private static instances: Map<string, LmsRequestScheduler> = new Map()

  static getInstance(baseUrl: string, config?: SchedulerConfig): LmsRequestScheduler

  /** Submit a request to the queue */
  submit<T>(request: QueuedRequest): Promise<Response>

  /** Get current status */
  getStatus(): SchedulerStatus

  /** Pause/resume processing */
  pause(): void
  resume(): void
}

interface SchedulerConfig {
  /** Max concurrent requests (default: 10) */
  maxConcurrent?: number
  /** Max queue size (default: 1000) */
  maxQueueSize?: number
  /** Queue timeout in ms (default: 60000) */
  queueTimeout?: number
}
```

**Key behavior:**
- All requests from all users to `https://school.instructure.com` share ONE scheduler
- Different base URLs get separate schedulers
- Enforces concurrency limit globally

---

### Layer 2: HTTP Client Base (`http-client-base.ts`)

Abstract base class with common HTTP logic. Provider-specific clients extend this.

```typescript
abstract class LmsHttpClientBase {
  constructor(
    protected config: HttpClientConfig,
    protected scheduler: LmsRequestScheduler
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Common logic (implemented once)
  // ═══════════════════════════════════════════════════════════════

  async execute<T>(request: LmsRequest): Promise<T> {
    const response = await this.executeWithRetry(request)
    this.updateThrottleState(this.parseRateLimit(response.headers))
    
    if (!response.ok) {
      throw this.parseError(response)
    }
    
    return response.json()
  }

  async *executePaginated<T>(request: LmsRequest): AsyncGenerator<T, MultiOperationResult<T>> {
    let nextUrl: string | null = this.buildUrl(request)
    const results: T[] = []
    const errors: LmsError[] = []

    while (nextUrl) {
      try {
        const response = await this.executeWithRetry({ ...request, url: nextUrl })
        const data = await response.json() as T[]
        
        for (const item of data) {
          results.push(item)
          yield item
        }

        const pagination = this.parsePagination(response.headers)
        nextUrl = pagination.next
      } catch (error) {
        // Handle based on multiOperationStrategy
        if (this.config.multiOperationStrategy?.onError === 'collect') {
          errors.push(error as LmsError)
        } else if (this.config.multiOperationStrategy?.onError === 'skip') {
          // Log and continue
        } else {
          throw error
        }
      }
    }

    return { data: results, errors, complete: errors.length === 0, stats: { ... } }
  }

  async batchExecute<T>(requests: LmsRequest[]): Promise<MultiOperationResult<T>> {
    // Process in batches respecting concurrency
    // Uses same error strategy as pagination
  }

  // ═══════════════════════════════════════════════════════════════
  // Provider-specific (must implement)
  // ═══════════════════════════════════════════════════════════════

  /** Parse rate limit info from response headers */
  protected abstract parseRateLimit(headers: Headers): RateLimitInfo

  /** Parse pagination info from response headers */
  protected abstract parsePagination(headers: Headers): PaginationInfo

  /** Parse error response into LmsError */
  protected abstract parseError(response: Response): LmsError

  /** Get authorization header */
  protected abstract getAuthHeader(): Record<string, string>
}
```

---

### Layer 3: Canvas HTTP Client (`canvas/http-client.ts`)

Canvas-specific HTTP handling. Extends the abstract base.

```typescript
class CanvasHttpClient extends LmsHttpClientBase {
  /**
   * Parse Canvas rate limit headers.
   * Canvas uses: X-Rate-Limit-Remaining, X-Request-Cost
   */
  protected parseRateLimit(headers: Headers): RateLimitInfo {
    return {
      remaining: headers.get('X-Rate-Limit-Remaining') 
        ? Number(headers.get('X-Rate-Limit-Remaining')) 
        : null,
      cost: headers.get('X-Request-Cost')
        ? Number(headers.get('X-Request-Cost'))
        : 1,
    }
  }

  /**
   * Parse Canvas Link header pagination.
   * Format: <url>; rel="next", <url>; rel="last"
   */
  protected parsePagination(headers: Headers): PaginationInfo {
    const linkHeader = headers.get('Link')
    if (!linkHeader) {
      return { next: null, prev: null, first: null, last: null }
    }
    return parseLinkHeader(linkHeader)
  }

  /**
   * Parse Canvas error response.
   */
  protected parseError(response: Response): LmsError {
    // Canvas returns { errors: [{ message: string }] } or { message: string }
    // Parse and return appropriate LmsError subclass
  }

  protected getAuthHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.accessToken}` }
  }
}
```

---

### Layer 4: Canvas Request Builder (`canvas/request-builder.ts`)

Knows Canvas API endpoints, parameters, and body shapes. Pure functions, no HTTP logic.

**Parameter pattern:** Single object with path params flat, `query`/`payload` as reserved nested keys.
- Path params (courseId, assignmentId, etc.) at top level
- `query` key for GET filter/pagination options
- `payload` key for POST/PUT body data
- Methods without options stay simple: `getUser({ userId })`

```typescript
interface LmsRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  query?: Record<string, string | string[]>
  body?: unknown
}

// ═══════════════════════════════════════════════════════════════
// Query Types (nested under `query` key)
// ═══════════════════════════════════════════════════════════════

interface ListCoursesQuery {
  enrollmentType?: 'teacher' | 'student' | 'ta' | 'observer' | 'designer'
  enrollmentState?: 'active' | 'invited_or_pending' | 'completed'
  state?: ('unpublished' | 'available' | 'completed' | 'deleted')[]
  include?: ('total_students' | 'teachers' | 'term' | 'course_image')[]
  perPage?: number
}

interface GetCourseQuery {
  include?: ('total_students' | 'teachers' | 'term' | 'course_image' | 'syllabus_body')[]
}

interface ListUsersQuery {
  enrollmentType?: ('teacher' | 'student' | 'ta' | 'observer')[]
  include?: ('email' | 'enrollments' | 'avatar_url')[]
  perPage?: number
}

interface ListAssignmentsQuery {
  include?: ('submission' | 'all_dates' | 'overrides')[]
  searchTerm?: string
  orderBy?: 'position' | 'name' | 'due_at'
  perPage?: number
}

interface ListEnrollmentsQuery {
  type?: ('StudentEnrollment' | 'TeacherEnrollment' | 'TaEnrollment')[]
  state?: ('active' | 'invited' | 'completed')[]
  include?: ('avatar_url' | 'group_ids')[]
  perPage?: number
}

class CanvasRequestBuilder {
  // ═══════════════════════════════════════════════════════════════
  // Courses
  // ═══════════════════════════════════════════════════════════════

  getCourse({ courseId, query }: { courseId: string; query?: GetCourseQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}`,
      query: this.toQueryParams(query),
    }
  }

  listCourses({ query }: { query?: ListCoursesQuery } = {}): LmsRequest {
    return {
      method: 'GET',
      path: '/api/v1/courses',
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════════════════════════

  getUser({ userId }: { userId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/users/${userId}`,
    }
  }

  listCourseUsers({ courseId, query }: { courseId: string; query?: ListUsersQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/users`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignments
  // ═══════════════════════════════════════════════════════════════

  getAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    }
  }

  listAssignments({ courseId, query }: { courseId: string; query?: ListAssignmentsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments`,
      query: this.toQueryParams(query),
    }
  }

  createAssignment({ courseId, payload }: { courseId: string; payload: CanvasCreateAssignmentInput }): LmsRequest {
    return {
      method: 'POST',
      path: `/api/v1/courses/${courseId}/assignments`,
      body: { assignment: payload },
    }
  }

  updateAssignment({ courseId, assignmentId, payload }: { courseId: string; assignmentId: string; payload: CanvasUpdateAssignmentInput }): LmsRequest {
    return {
      method: 'PUT',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
      body: { assignment: payload },
    }
  }

  deleteAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }): LmsRequest {
    return {
      method: 'DELETE',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Submissions
  // ═══════════════════════════════════════════════════════════════

  getSubmission({ courseId, assignmentId, userId }: { courseId: string; assignmentId: string; userId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
    }
  }

  listSubmissions({ courseId, assignmentId }: { courseId: string; assignmentId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
    }
  }

  gradeSubmission({ courseId, assignmentId, userId, payload }: { courseId: string; assignmentId: string; userId: string; payload: CanvasGradeInput }): LmsRequest {
    return {
      method: 'PUT',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      body: { submission: payload },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Canvas-specific endpoints (Modules, Enrollments)
  // ═══════════════════════════════════════════════════════════════

  listModules({ courseId }: { courseId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/modules`,
    }
  }

  listModuleItems({ courseId, moduleId }: { courseId: string; moduleId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/modules/${moduleId}/items`,
    }
  }

  listEnrollments({ courseId, query }: { courseId: string; query?: ListEnrollmentsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/enrollments`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  private toQueryParams(query?: Record<string, unknown>): Record<string, string | string[]> | undefined {
    if (!query) return undefined
    
    const result: Record<string, string | string[]> = {}
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      
      // Convert camelCase to snake_case for Canvas API
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
      
      // Handle arrays (Canvas uses param[] syntax)
      if (Array.isArray(value)) {
        result[`${snakeKey}[]`] = value.map(String)
      } else {
        result[snakeKey] = String(value)
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
}
```

**Usage examples:**
```typescript
// Simple - just path params
builder.getUser({ userId: '123' })
builder.getAssignment({ courseId: '1', assignmentId: '42' })
builder.deleteAssignment({ courseId: '1', assignmentId: '42' })

// With query options
builder.getCourse({ courseId: '123', query: { include: ['teachers', 'term'] } })
builder.listCourses({ query: { enrollmentType: 'teacher', perPage: 50 } })
builder.listAssignments({ courseId: '1', query: { orderBy: 'due_at' } })

// With payload (POST/PUT)
builder.createAssignment({ courseId: '1', payload: { name: 'Quiz 1', points_possible: 100 } })
builder.updateAssignment({ courseId: '1', assignmentId: '42', payload: { name: 'Updated Quiz' } })
builder.gradeSubmission({ courseId: '1', assignmentId: '42', userId: '999', payload: { posted_grade: 'A' } })

// Easy to spread options
const defaults = { perPage: 100, include: ['email'] }
builder.listCourseUsers({ courseId: '1', query: { ...defaults, enrollmentType: ['student'] } })
```

**Benefits:**
- **One param:** Always just one object to pass
- **Clear separation:** Path params at top, `query`/`payload` nested
- **Simple calls stay simple:** `getUser({ userId })` - no empty objects
- **Easy spreading:** Merge query options naturally
- **Type-safe:** TypeScript enforces required vs optional fields

---

### Layer 5: Canvas API (`canvas/api.ts`)

Combines Request Builder + HTTP Client. This is what users interact with for raw Canvas data.

The public API mirrors the builder's single-param pattern for consistency.

```typescript
class CanvasApi {
  constructor(
    private builder: CanvasRequestBuilder,
    private http: CanvasHttpClient
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Courses
  // ═══════════════════════════════════════════════════════════════

  async getCourse({ courseId, query }: { courseId: string; query?: GetCourseQuery }): Promise<CanvasCourse> {
    const request = this.builder.getCourse({ courseId, query })
    return this.http.execute(request)
  }

  async *listCourses({ query }: { query?: ListCoursesQuery } = {}): AsyncGenerator<CanvasCourse> {
    const request = this.builder.listCourses({ query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════════════════════════

  async getUser({ userId }: { userId: string }): Promise<CanvasUser> {
    const request = this.builder.getUser({ userId })
    return this.http.execute(request)
  }

  async *listCourseUsers({ courseId, query }: { courseId: string; query?: ListUsersQuery }): AsyncGenerator<CanvasUser> {
    const request = this.builder.listCourseUsers({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignments
  // ═══════════════════════════════════════════════════════════════

  async getAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }): Promise<CanvasAssignment> {
    const request = this.builder.getAssignment({ courseId, assignmentId })
    return this.http.execute(request)
  }

  async *listAssignments({ courseId, query }: { courseId: string; query?: ListAssignmentsQuery }): AsyncGenerator<CanvasAssignment> {
    const request = this.builder.listAssignments({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  async createAssignment({ courseId, payload }: { courseId: string; payload: CanvasCreateAssignmentInput }): Promise<CanvasAssignment> {
    const request = this.builder.createAssignment({ courseId, payload })
    return this.http.execute(request)
  }

  async updateAssignment({ courseId, assignmentId, payload }: { courseId: string; assignmentId: string; payload: CanvasUpdateAssignmentInput }): Promise<CanvasAssignment> {
    const request = this.builder.updateAssignment({ courseId, assignmentId, payload })
    return this.http.execute(request)
  }

  async deleteAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }): Promise<void> {
    const request = this.builder.deleteAssignment({ courseId, assignmentId })
    await this.http.execute(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Submissions
  // ═══════════════════════════════════════════════════════════════

  async getSubmission({ courseId, assignmentId, userId }: { courseId: string; assignmentId: string; userId: string }): Promise<CanvasSubmission> {
    const request = this.builder.getSubmission({ courseId, assignmentId, userId })
    return this.http.execute(request)
  }

  async *listSubmissions({ courseId, assignmentId }: { courseId: string; assignmentId: string }): AsyncGenerator<CanvasSubmission> {
    const request = this.builder.listSubmissions({ courseId, assignmentId })
    yield* this.http.executePaginated(request)
  }

  async gradeSubmission({ courseId, assignmentId, userId, payload }: { courseId: string; assignmentId: string; userId: string; payload: CanvasGradeInput }): Promise<CanvasSubmission> {
    const request = this.builder.gradeSubmission({ courseId, assignmentId, userId, payload })
    return this.http.execute(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Batch Operations
  // ═══════════════════════════════════════════════════════════════

  async batchUpdateAssignments(
    updates: Array<{ courseId: string; assignmentId: string; payload: CanvasUpdateAssignmentInput }>
  ): Promise<MultiOperationResult<CanvasAssignment>> {
    const requests = updates.map(u => this.builder.updateAssignment(u))
    return this.http.batchExecute(requests)
  }

  async batchGradeSubmissions(
    grades: Array<{ courseId: string; assignmentId: string; userId: string; payload: CanvasGradeInput }>
  ): Promise<MultiOperationResult<CanvasSubmission>> {
    const requests = grades.map(g => this.builder.gradeSubmission(g))
    return this.http.batchExecute(requests)
  }
}
```

**Usage examples:**
```typescript
const api = new CanvasApi(builder, httpClient)

// Simple calls
const user = await api.getUser({ userId: '123' })
const assignment = await api.getAssignment({ courseId: '1', assignmentId: '42' })

// With query options
const course = await api.getCourse({ courseId: '123', query: { include: ['teachers'] } })
for await (const user of api.listCourseUsers({ courseId: '1', query: { include: ['email'] } })) {
  console.log(user.email)
}

// Mutations
await api.createAssignment({ courseId: '1', payload: { name: 'Final Exam', points_possible: 100 } })
await api.gradeSubmission({ courseId: '1', assignmentId: '42', userId: '999', payload: { posted_grade: 'A' } })

// Batch operations - array items match the single-call signature
const result = await api.batchUpdateAssignments([
  { courseId: '1', assignmentId: '1', payload: { name: 'Quiz 1 (Updated)' } },
  { courseId: '1', assignmentId: '2', payload: { name: 'Quiz 2 (Updated)' } },
])
```

---

### Layer 6: Canvas Types (`canvas/types.ts`)

Raw Canvas API types exactly as returned by the Canvas API.

```typescript
// Canvas returns these exact shapes
interface CanvasCourse {
  id: number
  name: string
  course_code: string
  workflow_state: 'unpublished' | 'available' | 'completed' | 'deleted'
  account_id: number
  start_at: string | null
  end_at: string | null
  enrollments?: CanvasEnrollment[]
  total_students?: number
  // ... many more Canvas-specific fields
}

interface CanvasUser {
  id: number
  name: string
  sortable_name: string
  short_name: string
  login_id: string
  email?: string
  avatar_url: string
}

interface CanvasAssignment {
  id: number
  name: string
  description: string
  due_at: string | null
  points_possible: number
  grading_type: 'pass_fail' | 'percent' | 'letter_grade' | 'gpa_scale' | 'points' | 'not_graded'
  submission_types: string[]
  published: boolean
}

interface CanvasSubmission {
  id: number
  assignment_id: number
  user_id: number
  submitted_at: string | null
  grade: string | null
  score: number | null
  workflow_state: 'submitted' | 'graded' | 'pending_review' | 'unsubmitted'
}

// Canvas-specific types (no generic equivalent)
interface CanvasModule {
  id: number
  name: string
  position: number
  items_count: number
}
```

---

### Layer 7: Canvas Adapter (`canvas/adapter.ts`)

Transforms Canvas-specific data into generic LMS types.

```typescript
class CanvasAdapter {
  constructor(private api: CanvasApi) {}

  // ═══════════════════════════════════════════════════════════════
  // Courses
  // ═══════════════════════════════════════════════════════════════

  async getCourse(courseId: string): Promise<LmsCourse> {
    const canvas = await this.api.getCourse(courseId)
    return this.transformCourse(canvas)
  }

  async *listCourses(): AsyncGenerator<LmsCourse> {
    for await (const canvas of this.api.listCourses()) {
      yield this.transformCourse(canvas)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Transformations
  // ═══════════════════════════════════════════════════════════════

  private transformCourse(canvas: CanvasCourse): LmsCourse {
    return {
      id: String(canvas.id),
      externalId: String(canvas.id),
      provider: 'canvas',
      name: canvas.name,
      code: canvas.course_code,
      status: this.mapCourseStatus(canvas.workflow_state),
      startDate: canvas.start_at ? new Date(canvas.start_at) : null,
      endDate: canvas.end_at ? new Date(canvas.end_at) : null,
      metadata: { accountId: String(canvas.account_id) },
    }
  }

  private transformUser(canvas: CanvasUser): LmsUser {
    return {
      id: String(canvas.id),
      externalId: String(canvas.id),
      provider: 'canvas',
      name: canvas.name,
      displayName: canvas.short_name,
      email: canvas.email ?? null,
      avatarUrl: canvas.avatar_url,
      role: 'unknown', // Set based on context
      metadata: { loginId: canvas.login_id },
    }
  }

  private mapCourseStatus(state: CanvasCourse['workflow_state']): LmsCourseStatus {
    const mapping: Record<string, LmsCourseStatus> = {
      unpublished: 'draft',
      available: 'active',
      completed: 'completed',
      deleted: 'archived',
    }
    return mapping[state] ?? 'unknown'
  }
}
```

---

### Layer 8: Generic LMS Types (`types.ts`)

Provider-agnostic interfaces. Application code uses these types.

```typescript
type LmsProviderType = 'canvas' | 'moodle' | 'blackboard' | 'schoology'

// ═══════════════════════════════════════════════════════════════
// Course
// ═══════════════════════════════════════════════════════════════

interface LmsCourse {
  id: string
  externalId: string
  provider: LmsProviderType
  name: string
  code: string
  status: LmsCourseStatus
  startDate: Date | null
  endDate: Date | null
  metadata: Record<string, unknown>
}

type LmsCourseStatus = 'draft' | 'active' | 'completed' | 'archived' | 'unknown'

// ═══════════════════════════════════════════════════════════════
// User
// ═══════════════════════════════════════════════════════════════

interface LmsUser {
  id: string
  externalId: string
  provider: LmsProviderType
  email: string | null
  name: string
  displayName: string
  avatarUrl: string | null
  role: LmsUserRole
  metadata: Record<string, unknown>
}

type LmsUserRole = 'student' | 'teacher' | 'ta' | 'observer' | 'admin' | 'unknown'

// ═══════════════════════════════════════════════════════════════
// Assignment
// ═══════════════════════════════════════════════════════════════

interface LmsAssignment {
  id: string
  externalId: string
  provider: LmsProviderType
  courseId: string
  name: string
  description: string | null
  dueDate: Date | null
  pointsPossible: number | null
  gradingType: LmsGradingType
  submissionTypes: LmsSubmissionType[]
  status: LmsAssignmentStatus
  metadata: Record<string, unknown>
}

type LmsGradingType = 'points' | 'percentage' | 'letter' | 'pass_fail' | 'not_graded'
type LmsSubmissionType = 'online_text' | 'online_upload' | 'online_url' | 'media' | 'none'
type LmsAssignmentStatus = 'draft' | 'published' | 'deleted'

// ═══════════════════════════════════════════════════════════════
// Submission
// ═══════════════════════════════════════════════════════════════

interface LmsSubmission {
  id: string
  externalId: string
  provider: LmsProviderType
  assignmentId: string
  userId: string
  status: LmsSubmissionStatus
  submittedAt: Date | null
  grade: string | null
  score: number | null
  feedback: string | null
  metadata: Record<string, unknown>
}

type LmsSubmissionStatus = 'not_submitted' | 'submitted' | 'graded' | 'pending_review'
```

---

### Layer 9: LmsClient (`client.ts`)

Unified entry point. Provides both generic interface AND raw provider API.

```typescript
type ProviderApiMap = {
  canvas: CanvasApi
  moodle: MoodleApi
  blackboard: BlackboardApi
}

interface LmsClientConfig<P extends LmsProviderType> {
  provider: P
  baseUrl: string
  accessToken: string
  refreshToken?: string
  onTokenRefresh?: (tokens: TokenPair) => Promise<void>
  multiOperationStrategy?: MultiOperationConfig
}

class LmsClient<P extends LmsProviderType> {
  /** Raw provider-specific API (Canvas endpoints return CanvasCourse, etc.) */
  readonly api: ProviderApiMap[P]
  
  private adapter: LmsAdapter
  private httpClient: LmsHttpClientBase

  constructor(config: LmsClientConfig<P>) {
    const scheduler = LmsRequestScheduler.getInstance(config.baseUrl)
    const { api, adapter, httpClient } = createProviderComponents(config, scheduler)
    
    this.api = api as ProviderApiMap[P]
    this.adapter = adapter
    this.httpClient = httpClient
  }

  // ═══════════════════════════════════════════════════════════════
  // Generic Interface (same for all providers)
  // Returns: LmsCourse, LmsUser, LmsAssignment, etc.
  // ═══════════════════════════════════════════════════════════════

  async getCourse(courseId: string): Promise<LmsCourse> {
    return this.adapter.getCourse(courseId)
  }

  async *listCourses(): AsyncGenerator<LmsCourse> {
    yield* this.adapter.listCourses()
  }

  async getUser(userId: string): Promise<LmsUser> {
    return this.adapter.getUser(userId)
  }

  async *listCourseUsers(courseId: string): AsyncGenerator<LmsUser> {
    yield* this.adapter.listCourseUsers(courseId)
  }

  async getAssignment(courseId: string, assignmentId: string): Promise<LmsAssignment> {
    return this.adapter.getAssignment(courseId, assignmentId)
  }

  async *listAssignments(courseId: string): AsyncGenerator<LmsAssignment> {
    yield* this.adapter.listAssignments(courseId)
  }

  async createAssignment(courseId: string, data: CreateLmsAssignment): Promise<LmsAssignment> {
    return this.adapter.createAssignment(courseId, data)
  }

  async updateAssignment(courseId: string, assignmentId: string, data: UpdateLmsAssignment): Promise<LmsAssignment> {
    return this.adapter.updateAssignment(courseId, assignmentId, data)
  }

  async deleteAssignment(courseId: string, assignmentId: string): Promise<void> {
    return this.adapter.deleteAssignment(courseId, assignmentId)
  }

  // ═══════════════════════════════════════════════════════════════
  // Status
  // ═══════════════════════════════════════════════════════════════

  getQueueStatus(): QueueStatus {
    return this.httpClient.getQueueStatus()
  }

  getRateLimitStatus(): RateLimitStatus {
    return this.httpClient.getRateLimitStatus()
  }
}
```

---

### Entry Point (`index.ts`)

Factory function and main exports.

```typescript
export * from './types'
export * from './errors'
export { LmsClient } from './client'
export { CanvasApi } from './canvas'

/**
 * Create an LMS client instance.
 * Returns typed client with access to both generic interface and raw provider API.
 */
export function createLmsClient<P extends LmsProviderType>(
  config: LmsClientConfig<P>
): LmsClient<P> {
  return new LmsClient(config)
}

// Usage examples:

// 1. Generic interface (recommended for most use cases)
const client = createLmsClient({ provider: 'canvas', baseUrl, accessToken })
const course = await client.getCourse('123')           // Returns: LmsCourse
for await (const user of client.listCourseUsers('123')) {
  console.log(user.name)                               // user is LmsUser
}

// 2. Raw provider API (when you need Canvas-specific data)
const canvasClient = createLmsClient({ provider: 'canvas', baseUrl, accessToken })
const rawCourse = await canvasClient.api.getCourse('123')  // Returns: CanvasCourse
console.log(rawCourse.workflow_state)                      // Canvas-specific field

// 3. Batch operations through raw API
const assignments = ['1', '2', '3'].map(id => ({
  path: `/api/v1/courses/123/assignments/${id}`,
}))
const result = await canvasClient.api.httpClient.batchGet(assignments)
```

## Error Handling

See the comprehensive error types defined in [Layer 1: HTTP Client](#layer-1-http-client-http-clientts) above, including:
- `LmsError` - Base error with code, status, and retryable flag
- `LmsThrottleError` - Rate limiting (429 responses)
- `LmsNetworkError` - Network failures
- `LmsTimeoutError` - Request timeouts
- `LmsTokenError` - Authentication/token issues

## Token Management

OAuth2 token handling for Canvas:

1. **Initial connection**: User authorizes via Canvas OAuth2 flow
2. **Token storage**: Access token + refresh token stored (likely in DB, associated with user/org)
3. **Auto-refresh**: When 401 received, automatically use refresh token
4. **Callback**: `onTokenRefresh` callback to persist new tokens

```typescript
// Token refresh flow
async function handleTokenRefresh(refreshToken: string): Promise<TokenPair> {
  const response = await fetch(`${baseUrl}/login/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.CANVAS_CLIENT_ID,
      client_secret: env.CANVAS_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })
  // ... handle response
}
```

## Implementation Phases

### Phase 1: Foundation
- [ ] Create folder structure (`backend/src/lib/lms/`)
- [ ] Implement `errors.ts` with all error types
- [ ] Define generic LMS types (`types.ts`)
- [ ] Add shared configuration interfaces

### Phase 2: Request Scheduler (Layer 1)
- [ ] Implement `request-scheduler.ts`:
  - [ ] Request queue with FIFO ordering
  - [ ] Concurrency limiter (semaphore pattern)
  - [ ] Shared throttle state tracking (`X-Rate-Limit-Remaining`)
  - [ ] Proactive delay when budget is low
  - [ ] 429 handling with exponential backoff
  - [ ] Singleton pattern per LMS base URL
- [ ] Add unit tests for scheduler

### Phase 3: HTTP Client Base & Canvas Client (Layers 2-3)
- [ ] Implement `http-client-base.ts`:
  - [ ] Abstract base class with common HTTP logic
  - [ ] Single operations: `get`, `post`, `put`, `delete`
  - [ ] Batch operations: `batchGet`, `batchPost`, `batchPut`, `batchDelete`
  - [ ] Pagination: `getPage`, `getPaginated`, `getAllPages`
  - [ ] `MultiOperationConfig` error handling
  - [ ] Submit all requests through scheduler
- [ ] Implement `canvas/http-client.ts`:
  - [ ] Canvas-specific Link header pagination parsing
  - [ ] `X-Rate-Limit-Remaining` and `X-Request-Cost` handling
  - [ ] Token refresh for Canvas OAuth2
- [ ] Add unit tests for HTTP clients

### Phase 4: Canvas Request Builder & API (Layers 4-5)
- [ ] Implement `canvas/request-builder.ts`:
  - [ ] Define Canvas endpoint constants
  - [ ] Path builders for all supported endpoints
  - [ ] Query parameter builders (pagination, includes, filters)
- [ ] Implement `canvas/api.ts`:
  - [ ] Courses endpoints (list, get)
  - [ ] Users endpoints (list by course, get)
  - [ ] Assignment endpoints (CRUD)
  - [ ] Submission endpoints (list, get, grade)
  - [ ] Modules and enrollments endpoints
- [ ] Add unit tests for Canvas API layer

### Phase 5: Canvas Types & Adapter (Layers 6-7)
- [ ] Define Canvas raw types (`canvas/types.ts`)
- [ ] Implement `canvas/adapter.ts`:
  - [ ] Course transformation with status mapping
  - [ ] User transformation with role mapping
  - [ ] Assignment transformation
  - [ ] Submission transformation
- [ ] Add unit tests for transformation logic

### Phase 6: LmsClient & Entry Point (Layers 8-9)
- [ ] Implement `client.ts` (LmsClient class)
- [ ] Create factory function in `index.ts`
- [ ] Set up exports structure
- [ ] Add integration tests with Canvas sandbox

### Phase 7: Token Management
- [ ] Implement Canvas OAuth2 token refresh flow
- [ ] Add `onTokenRefresh` callback support
- [ ] Handle token expiration edge cases
- [ ] Add automatic 401 → refresh → retry flow
- [ ] Test token refresh scenarios

### Phase 8: Polish & Hardening
- [ ] Add comprehensive JSDoc comments
- [ ] Create usage examples
- [ ] Performance testing (high concurrency, large batches)
- [ ] Load testing with simulated multi-user scenarios
- [ ] Edge case handling and error refinement
- [ ] Logging and observability integration (Pino)

## Future Providers

When adding new LMS providers (Moodle, Blackboard, Schoology):

```
backend/src/lib/lms/
├── canvas/
├── moodle/
│   ├── index.ts           # Exports MoodleApi, MoodleAdapter
│   ├── types.ts           # Layer 6: Moodle API types
│   ├── request-builder.ts # Layer 4: Moodle endpoints & path builders
│   ├── http-client.ts     # Layer 3: Moodle-specific HTTP handling
│   ├── api.ts             # Layer 5: Moodle web services calls
│   └── adapter.ts         # Layer 7: Moodle → Generic LMS
└── blackboard/
    └── ...
```

Each provider follows the same layer pattern, enabling type-safe access to both generic and raw APIs:

```typescript
// Generic interface works with any provider
const client = createLmsClient(config)  // config.provider can be 'canvas', 'moodle', etc.
for await (const course of client.listCourses()) {
  console.log(course.name)  // course is LmsCourse, regardless of provider
}

// Type-safe raw API access
const canvasClient = createLmsClient({ provider: 'canvas', ...config })
canvasClient.api.getCourse('123')  // Returns CanvasCourse

const moodleClient = createLmsClient({ provider: 'moodle', ...config })
moodleClient.api.getCourse('123')  // Returns MoodleCourse (different shape)
```

## Configuration

Environment variables needed:

```env
# Canvas OAuth2 (for token refresh)
CANVAS_CLIENT_ID=your_client_id
CANVAS_CLIENT_SECRET=your_client_secret

# Optional: Default rate limit settings
LMS_RATE_LIMIT_REQUESTS_PER_MINUTE=300
LMS_REQUEST_TIMEOUT_MS=30000
```

## Testing Strategy

### Unit tests
- HTTP client: mock fetch, test rate limiting, pagination parsing
- Canvas API: mock HTTP client, test endpoint construction
- Adapter: test transformation logic with fixture data

### Integration tests
- Use Canvas test/sandbox instance
- Test full flow: auth → list courses → get assignments
- Test token refresh with expired token

## Open Questions

1. **Token storage**: Where to store LMS tokens? Separate table? Organization settings?
2. **Multi-tenant**: How to handle multiple Canvas instances per organization?
3. **Webhooks**: Should we support Canvas webhooks for real-time updates?
4. **Sync strategy**: One-time fetch vs. periodic sync vs. webhook-driven?
5. **Caching**: Cache course/user data? TTL strategy?
6. **Logging**: How verbose should HTTP client logging be? Integrate with existing Pino logger?
7. **Scheduler persistence**: Should scheduler state survive server restarts? (queue, rate limit budget)
8. **Scheduler scope**: One scheduler per LMS base URL, or per LMS + organization?
9. **Queue priority**: Should some requests have priority? (e.g., single GET over large batch)
10. **Graceful degradation**: How to handle when queue is full? Reject new requests? Shed load?

## References

- [Canvas REST API Documentation](https://canvas.instructure.com/doc/api/)
- [Canvas OAuth2 Documentation](https://canvas.instructure.com/doc/api/file.oauth.html)
- [Canvas Rate Limiting](https://canvas.instructure.com/doc/api/file.throttling.html)
