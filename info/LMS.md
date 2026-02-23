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
├── errors.ts                   # LMS-specific error keys + helper functions (uses AppError)
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
  onEachError?: (error: AppError, context: OperationContext) => void
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
  errors: AppError[]
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

#### Error handling

The LMS module reuses Cella's existing `AppError` class (`backend/src/lib/error.ts`) instead of defining custom error classes. Each error scenario maps to a specific error key that gets added to the i18n error locales. LMS-specific context is passed via the `meta` field.

**New error keys** (add to `locales/en/error.json`):

```json
{
  "lms_rate_limited": "LMS rate limit exceeded",
  "lms_rate_limited.text": "The LMS API rate limit has been exceeded. Please try again later.",
  "lms_token_error": "LMS authentication failed",
  "lms_token_error.text": "Could not authenticate with the LMS. Please reconnect your account.",
  "lms_network_error": "LMS connection failed",
  "lms_network_error.text": "Could not connect to the LMS. Please check your connection and try again.",
  "lms_timeout": "LMS request timed out",
  "lms_timeout.text": "The LMS did not respond in time. Please try again later.",
  "lms_queue_full": "LMS request queue full",
  "lms_queue_full.text": "Too many LMS requests in progress. Please try again later.",
  "lms_not_found": "LMS resource not found",
  "lms_not_found.text": "The requested resource was not found on the LMS.",
  "lms_provider_error": "LMS provider error",
  "lms_provider_error.text": "The LMS returned an unexpected error. Please try again later.",
  "lms_operation_failed": "LMS operation failed",
  "lms_operation_failed.text": "One or more LMS operations failed during a batch or paginated request.",
  "lms_not_configured": "LMS not configured",
  "lms_not_configured.text": "Your organization has not configured an LMS integration. Please contact your administrator.",
  "lms_not_connected": "LMS not connected",
  "lms_not_connected.text": "You have not connected your LMS account. Please connect it in your settings.",
  "lms_reauth_required": "LMS re-authorization required",
  "lms_reauth_required.text": "Your LMS session has expired. Please reconnect your account."
}
```

**Usage pattern:**

```typescript
import { AppError } from '#/lib/error'

// Rate limit exceeded (429)
throw new AppError(429, 'lms_rate_limited', 'warn', {
  meta: { provider: 'canvas', retryAfterMs: 5000 },
})

// Token refresh failed (401)
throw new AppError(401, 'lms_token_error', 'warn', {
  meta: { provider: 'canvas', tokenErrorType: 'refresh_failed' },
})

// Network error
throw new AppError(502, 'lms_network_error', 'error', {
  meta: { provider: 'canvas' },
  originalError: cause,
})

// Request timeout
throw new AppError(504, 'lms_timeout', 'warn', {
  meta: { provider: 'canvas', timeoutMs: 30000 },
})

// Queue full
throw new AppError(503, 'lms_queue_full', 'warn', {
  meta: { provider: 'canvas', queueSize: 1000 },
})

// Operation failed in batch/pagination
throw new AppError(500, 'lms_operation_failed', 'error', {
  meta: {
    provider: 'canvas',
    operationType: 'pagination',
    index: 3,
    path: '/api/v1/courses/1/users',
  },
})

// Not connected (handler level)
throw new AppError(403, 'lms_not_connected', 'warn')

// Re-auth required (after token refresh failure)
throw new AppError(403, 'lms_reauth_required', 'warn', {
  meta: { provider: 'canvas' },
})
```

**Benefits of reusing `AppError`:**
- Errors automatically flow through the existing `appErrorHandler` (Sentry, structured JSON, logging)
- i18n support out of the box for every error type
- `meta` field carries all LMS-specific context (provider, retryAfterMs, timeoutMs, etc.)
- `originalError` field wraps underlying causes (network errors, etc.)
- No parallel error class hierarchy to maintain
- Handler code checks `error.type` instead of `instanceof`

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

// Uses the SchedulerConfig defined above (concurrency, throttling, retry)
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
    const errors: AppError[] = []

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
          errors.push(error as AppError)
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

  /** Parse error response into AppError */
  protected abstract parseError(response: Response): AppError

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
  protected parseError(response: Response): AppError {
    // Canvas returns { errors: [{ message: string }] } or { message: string }
    // Parse and return appropriate AppError with lms_* error key
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

// ═══════════════════════════════════════════════════════════════
// Query Types (nested under `query` key)
// ═══════════════════════════════════════════════════════════════

// --- Accounts ---

interface GetAccountQuery {
  include?: ('lti_guid' | 'registration_settings' | 'services')[]
}

// --- Courses ---

interface ListCoursesQuery {
  enrollmentType?: 'teacher' | 'student' | 'ta' | 'observer' | 'designer'
  enrollmentRole?: string
  enrollmentState?: 'active' | 'invited_or_pending' | 'completed'
  excludeBlueprintCourses?: boolean
  state?: ('unpublished' | 'available' | 'completed' | 'deleted')[]
  include?: ('needs_grading_count' | 'syllabus_body' | 'public_description' | 'total_scores' | 'current_grading_period_scores' | 'term' | 'account' | 'course_progress' | 'sections' | 'storage_quota_used_mb' | 'total_students' | 'passback_status' | 'favorites' | 'teachers' | 'observed_users' | 'course_image' | 'banner_image' | 'concluded')[]
  perPage?: number
}

interface GetCourseQuery {
  include?: ('needs_grading_count' | 'syllabus_body' | 'public_description' | 'total_scores' | 'current_grading_period_scores' | 'term' | 'account' | 'course_progress' | 'sections' | 'storage_quota_used_mb' | 'total_students' | 'passback_status' | 'favorites' | 'teachers' | 'observed_users' | 'tabs' | 'course_image' | 'banner_image' | 'concluded' | 'grading_periods')[]
}

// --- Users ---

interface ListAccountUsersQuery {
  searchTerm?: string
  enrollmentType?: 'teacher' | 'student' | 'ta' | 'observer' | 'designer'
  sort?: 'username' | 'email' | 'sis_id' | 'integration_id' | 'last_login'
  order?: 'asc' | 'desc'
  include?: ('email' | 'enrollments' | 'avatar_url' | 'last_login' | 'uuid')[]
  perPage?: number
}

interface ListCourseUsersQuery {
  searchTerm?: string
  sort?: 'username' | 'last_login' | 'email' | 'sis_id'
  enrollmentType?: ('teacher' | 'student' | 'ta' | 'observer' | 'designer')[]
  enrollmentRole?: string
  enrollmentState?: ('active' | 'invited' | 'rejected' | 'completed' | 'inactive')[]
  include?: ('enrollments' | 'locked' | 'avatar_url' | 'bio' | 'test_student' | 'custom_links' | 'current_grading_period_scores' | 'uuid' | 'email')[]
  userId?: string
  userIds?: string[]
  perPage?: number
}

// --- Sections ---

interface ListSectionsQuery {
  include?: ('students' | 'avatar_url' | 'enrollments' | 'total_students' | 'passback_status' | 'permissions')[]
  perPage?: number
}

// --- Enrollments ---

interface ListEnrollmentsQuery {
  type?: ('StudentEnrollment' | 'TeacherEnrollment' | 'TaEnrollment' | 'DesignerEnrollment' | 'ObserverEnrollment')[]
  role?: string[]
  state?: ('active' | 'invited' | 'creation_pending' | 'deleted' | 'rejected' | 'completed' | 'inactive' | 'current_and_invited' | 'current_and_future' | 'current_and_concluded')[]
  include?: ('avatar_url' | 'group_ids' | 'locked' | 'observed_users' | 'can_be_removed' | 'uuid' | 'current_points')[]
  userId?: string
  gradingPeriodId?: string
  perPage?: number
}

// --- Groups ---

interface ListGroupCategoriesQuery {
  perPage?: number
}

interface ListGroupsQuery {
  include?: ('users' | 'permissions' | 'group_category' | 'observed_users')[]
  perPage?: number
}

interface ListGroupUsersQuery {
  searchTerm?: string
  include?: ('avatar_url')[]
  perPage?: number
}

// --- Assignment Groups ---

interface ListAssignmentGroupsQuery {
  include?: ('assignments' | 'discussion_topic' | 'all_dates' | 'assignment_visibility' | 'overrides' | 'submission' | 'observed_users' | 'score_statistics')[]
  excludeAssignmentSubmissionTypes?: ('online_quiz' | 'discussion_topic' | 'wiki_page' | 'external_tool')[]
  overrideAssignmentDates?: boolean
  gradingPeriodId?: string
  scopeAssignmentsToStudent?: boolean
  perPage?: number
}

// --- Assignments ---

interface ListAssignmentsQuery {
  include?: ('submission' | 'all_dates' | 'overrides' | 'observed_users' | 'can_edit' | 'score_statistics')[]
  searchTerm?: string
  overrideAssignmentDates?: boolean
  needsGradingCountBySection?: boolean
  bucket?: 'past' | 'overdue' | 'undated' | 'ungraded' | 'unsubmitted' | 'upcoming' | 'future'
  assignmentIds?: string[]
  orderBy?: 'position' | 'name' | 'due_at'
  postToSis?: boolean
  perPage?: number
}

interface ListUserAssignmentsQuery {
  include?: ('submission' | 'all_dates' | 'overrides')[]
  orderBy?: 'position' | 'name' | 'due_at'
  courseAssignments?: boolean
  perPage?: number
}

// --- Submissions ---

interface ListSubmissionsQuery {
  include?: ('submission_history' | 'submission_comments' | 'rubric_assessment' | 'assignment' | 'visibility' | 'course' | 'user' | 'group' | 'read_status')[]
  grouped?: boolean
  perPage?: number
}

interface ListStudentSubmissionsQuery {
  studentIds?: string[]
  assignmentIds?: string[]
  grouped?: boolean
  include?: ('submission_history' | 'submission_comments' | 'rubric_assessment' | 'assignment' | 'total_scores' | 'visibility' | 'course' | 'user' | 'read_status')[]
  order?: 'id' | 'graded_at'
  orderDirection?: 'ascending' | 'descending'
  workflowState?: 'submitted' | 'unsubmitted' | 'graded' | 'pending_review'
  perPage?: number
}

// --- External Tools ---

interface ListExternalToolsQuery {
  searchTerm?: string
  selectable?: boolean
  includeParents?: boolean
  perPage?: number
}

// --- Outcomes ---

interface ListOutcomeGroupsQuery {
  perPage?: number
}

interface ListOutcomeGroupOutcomesQuery {
  outcomeStyle?: 'full' | 'abbrev'
  perPage?: number
}

class CanvasRequestBuilder {
  // ═══════════════════════════════════════════════════════════════
  // Accounts
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a single account.
   * @see {@link https://canvas.instructure.com/doc/api/accounts.html#method.accounts.show Canvas}
   */
  getAccount({ accountId, query }: { accountId: string; query?: GetAccountQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/accounts/${accountId}`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List accounts that the current user can view or manage.
   * @see {@link https://canvas.instructure.com/doc/api/accounts.html#method.accounts.manageable_accounts Canvas}
   */
  listManageableAccounts(): LmsRequest {
    return {
      method: 'GET',
      path: '/api/v1/manageable_accounts',
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Courses
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a single course by ID.
   * @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.show Canvas}
   */
  getCourse({ courseId, query }: { courseId: string; query?: GetCourseQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List courses for the current user.
   * @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.user_index Canvas}
   */
  listCourses({ query }: { query?: ListCoursesQuery } = {}): LmsRequest {
    return {
      method: 'GET',
      path: '/api/v1/courses',
      query: this.toQueryParams(query),
    }
  }

  /**
   * List courses for a specific user.
   * @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.user_index Canvas}
   */
  listUserCourses({ userId, query }: { userId: string; query?: ListCoursesQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/users/${userId}/courses`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a single user by ID.
   * @see {@link https://canvas.instructure.com/doc/api/users.html#method.users.api_show Canvas}
   */
  getUser({ userId }: { userId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/users/${userId}`,
    }
  }

  /**
   * List users in an account.
   * @see {@link https://canvas.instructure.com/doc/api/users.html#method.users.api_index Canvas}
   */
  listAccountUsers({ accountId, query }: { accountId: string; query?: ListAccountUsersQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/accounts/${accountId}/users`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List users enrolled in a course.
   * @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.users Canvas}
   */
  listCourseUsers({ courseId, query }: { courseId: string; query?: ListCourseUsersQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/users`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Sections
  // ═══════════════════════════════════════════════════════════════

  /**
   * List course sections.
   * @see {@link https://canvas.instructure.com/doc/api/sections.html#method.sections.index Canvas}
   */
  listSections({ courseId, query }: { courseId: string; query?: ListSectionsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/sections`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Enrollments
  // ═══════════════════════════════════════════════════════════════

  /**
   * List enrollments for a course.
   * @see {@link https://canvas.instructure.com/doc/api/enrollments.html Canvas}
   */
  listCourseEnrollments({ courseId, query }: { courseId: string; query?: ListEnrollmentsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/enrollments`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List enrollments for a user.
   * @see {@link https://canvas.instructure.com/doc/api/enrollments.html Canvas}
   */
  listUserEnrollments({ userId, query }: { userId: string; query?: ListEnrollmentsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/users/${userId}/enrollments`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Groups
  // ═══════════════════════════════════════════════════════════════

  /**
   * List group categories for a course.
   * @see {@link https://canvas.instructure.com/doc/api/group_categories.html#method.group_categories.index Canvas}
   */
  listGroupCategories({ courseId, query }: { courseId: string; query?: ListGroupCategoriesQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/group_categories`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List groups in a group category.
   * @see {@link https://canvas.instructure.com/doc/api/groups.html#method.groups.context_index Canvas}
   */
  listGroups({ groupCategoryId, query }: { groupCategoryId: string; query?: ListGroupsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/group_categories/${groupCategoryId}/groups`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List users in a group.
   * @see {@link https://canvas.instructure.com/doc/api/groups.html#method.groups.users Canvas}
   */
  listGroupUsers({ groupId, query }: { groupId: string; query?: ListGroupUsersQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/groups/${groupId}/users`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignment Groups
  // ═══════════════════════════════════════════════════════════════

  /**
   * List assignment groups for a course.
   * @see {@link https://canvas.instructure.com/doc/api/assignment_groups.html#method.assignment_groups.index Canvas}
   */
  listAssignmentGroups({ courseId, query }: { courseId: string; query?: ListAssignmentGroupsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignment_groups`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignments
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get a single assignment.
   * @see {@link https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.show Canvas}
   */
  getAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    }
  }

  /**
   * List assignments for a course.
   * @see {@link https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.index Canvas}
   */
  listAssignments({ courseId, query }: { courseId: string; query?: ListAssignmentsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List assignments for a specific user in a course.
   * @see {@link https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.user_index Canvas}
   */
  listUserAssignments({ userId, courseId, query }: { userId: string; courseId: string; query?: ListUserAssignmentsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/users/${userId}/courses/${courseId}/assignments`,
      query: this.toQueryParams(query),
    }
  }

  /** Create an assignment in a course. */
  createAssignment({ courseId, payload }: { courseId: string; payload: CanvasCreateAssignmentInput }): LmsRequest {
    return {
      method: 'POST',
      path: `/api/v1/courses/${courseId}/assignments`,
      body: { assignment: payload },
    }
  }

  /** Update an assignment. */
  updateAssignment({ courseId, assignmentId, payload }: { courseId: string; assignmentId: string; payload: CanvasUpdateAssignmentInput }): LmsRequest {
    return {
      method: 'PUT',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
      body: { assignment: payload },
    }
  }

  /** Delete an assignment. */
  deleteAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }): LmsRequest {
    return {
      method: 'DELETE',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Submissions
  // ═══════════════════════════════════════════════════════════════

  /** Get a single submission. */
  getSubmission({ courseId, assignmentId, userId }: { courseId: string; assignmentId: string; userId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
    }
  }

  /**
   * List submissions for an assignment.
   * @see {@link https://canvas.instructure.com/doc/api/submissions.html#method.submissions_api.index Canvas}
   */
  listSubmissions({ courseId, assignmentId, query }: { courseId: string; assignmentId: string; query?: ListSubmissionsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List submissions for multiple students across assignments in a course.
   * @see {@link https://canvas.instructure.com/doc/api/submissions.html#method.submissions_api.for_students Canvas}
   */
  listStudentSubmissions({ courseId, query }: { courseId: string; query?: ListStudentSubmissionsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/students/submissions`,
      query: this.toQueryParams(query),
    }
  }

  /** Grade or comment on a submission. */
  gradeSubmission({ courseId, assignmentId, userId, payload }: { courseId: string; assignmentId: string; userId: string; payload: CanvasGradeInput }): LmsRequest {
    return {
      method: 'PUT',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      body: { submission: payload },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // External Tools
  // ═══════════════════════════════════════════════════════════════

  /**
   * List external tools for a course.
   * @see {@link https://canvas.instructure.com/doc/api/external_tools.html#method.external_tools.index Canvas}
   */
  listExternalTools({ courseId, query }: { courseId: string; query?: ListExternalToolsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/external_tools`,
      query: this.toQueryParams(query),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Outcomes
  // ═══════════════════════════════════════════════════════════════

  /**
   * Redirect to root outcome group for a course.
   * @see {@link https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.redirect Canvas}
   */
  getRootOutcomeGroup({ courseId }: { courseId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/root_outcome_group`,
    }
  }

  /**
   * List outcome groups for a course.
   * @see {@link https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.index Canvas}
   */
  listOutcomeGroups({ courseId, query }: { courseId: string; query?: ListOutcomeGroupsQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/outcome_groups`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * List linked outcomes for an outcome group.
   * @see {@link https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.outcomes Canvas}
   */
  listOutcomeGroupOutcomes({ courseId, outcomeGroupId, query }: { courseId: string; outcomeGroupId: string; query?: ListOutcomeGroupOutcomesQuery }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/outcome_groups/${outcomeGroupId}/outcomes`,
      query: this.toQueryParams(query),
    }
  }

  /**
   * Show details for a specific outcome.
   * @see {@link https://canvas.instructure.com/doc/api/outcomes.html#method.outcomes_api.show Canvas}
   */
  getOutcome({ outcomeId }: { outcomeId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/outcomes/${outcomeId}`,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Proficiency
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get outcome proficiency ratings for an account.
   * @see {@link https://canvas.instructure.com/doc/api/proficiency_ratings.html#method.outcome_proficiency_api.show Canvas}
   */
  getOutcomeProficiency({ accountId }: { accountId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/accounts/${accountId}/outcome_proficiency`,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Modules
  // ═══════════════════════════════════════════════════════════════

  /** List modules for a course. */
  listModules({ courseId }: { courseId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/modules`,
    }
  }

  /** List items in a module. */
  listModuleItems({ courseId, moduleId }: { courseId: string; moduleId: string }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/modules/${moduleId}/items`,
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
builder.listAssignments({ courseId: '1', query: { orderBy: 'due_at', bucket: 'upcoming' } })

// New endpoints
builder.getAccount({ accountId: '1' })
builder.listSections({ courseId: '1', query: { include: ['total_students'] } })
builder.listGroupCategories({ courseId: '1' })
builder.listGroups({ groupCategoryId: '5' })
builder.listAssignmentGroups({ courseId: '1', query: { include: ['assignments'] } })
builder.listStudentSubmissions({ courseId: '1', query: { studentIds: ['all'], grouped: true } })
builder.listExternalTools({ courseId: '1', query: { searchTerm: 'turnitin' } })
builder.listOutcomeGroups({ courseId: '1' })
builder.getOutcomeProficiency({ accountId: '1' })

// With payload (POST/PUT)
builder.createAssignment({ courseId: '1', payload: { name: 'Quiz 1', points_possible: 100 } })
builder.updateAssignment({ courseId: '1', assignmentId: '42', payload: { name: 'Updated Quiz' } })
builder.gradeSubmission({ courseId: '1', assignmentId: '42', userId: '999', payload: { posted_grade: 'A' } })

// Easy to spread options
const defaults = { perPage: 100, include: ['email'] as const }
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
  // Accounts
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/accounts.html#method.accounts.show Canvas} */
  async getAccount({ accountId, query }: { accountId: string; query?: GetAccountQuery }): Promise<CanvasAccount> {
    const request = this.builder.getAccount({ accountId, query })
    return this.http.execute(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/accounts.html#method.accounts.manageable_accounts Canvas} */
  async *listManageableAccounts(): AsyncGenerator<CanvasAccount> {
    const request = this.builder.listManageableAccounts()
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Courses
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.show Canvas} */
  async getCourse({ courseId, query }: { courseId: string; query?: GetCourseQuery }): Promise<CanvasCourse> {
    const request = this.builder.getCourse({ courseId, query })
    return this.http.execute(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.user_index Canvas} */
  async *listCourses({ query }: { query?: ListCoursesQuery } = {}): AsyncGenerator<CanvasCourse> {
    const request = this.builder.listCourses({ query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.user_index Canvas} */
  async *listUserCourses({ userId, query }: { userId: string; query?: ListCoursesQuery }): AsyncGenerator<CanvasCourse> {
    const request = this.builder.listUserCourses({ userId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/users.html#method.users.api_show Canvas} */
  async getUser({ userId }: { userId: string }): Promise<CanvasUser> {
    const request = this.builder.getUser({ userId })
    return this.http.execute(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/users.html#method.users.api_index Canvas} */
  async *listAccountUsers({ accountId, query }: { accountId: string; query?: ListAccountUsersQuery }): AsyncGenerator<CanvasUser> {
    const request = this.builder.listAccountUsers({ accountId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/courses.html#method.courses.users Canvas} */
  async *listCourseUsers({ courseId, query }: { courseId: string; query?: ListCourseUsersQuery }): AsyncGenerator<CanvasUser> {
    const request = this.builder.listCourseUsers({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Sections
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/sections.html#method.sections.index Canvas} */
  async *listSections({ courseId, query }: { courseId: string; query?: ListSectionsQuery }): AsyncGenerator<CanvasSection> {
    const request = this.builder.listSections({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Enrollments
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/enrollments.html Canvas} */
  async *listCourseEnrollments({ courseId, query }: { courseId: string; query?: ListEnrollmentsQuery }): AsyncGenerator<CanvasEnrollment> {
    const request = this.builder.listCourseEnrollments({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/enrollments.html Canvas} */
  async *listUserEnrollments({ userId, query }: { userId: string; query?: ListEnrollmentsQuery }): AsyncGenerator<CanvasEnrollment> {
    const request = this.builder.listUserEnrollments({ userId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Groups
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/group_categories.html#method.group_categories.index Canvas} */
  async *listGroupCategories({ courseId, query }: { courseId: string; query?: ListGroupCategoriesQuery }): AsyncGenerator<CanvasGroupCategory> {
    const request = this.builder.listGroupCategories({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/groups.html#method.groups.context_index Canvas} */
  async *listGroups({ groupCategoryId, query }: { groupCategoryId: string; query?: ListGroupsQuery }): AsyncGenerator<CanvasGroup> {
    const request = this.builder.listGroups({ groupCategoryId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/groups.html#method.groups.users Canvas} */
  async *listGroupUsers({ groupId, query }: { groupId: string; query?: ListGroupUsersQuery }): AsyncGenerator<CanvasUser> {
    const request = this.builder.listGroupUsers({ groupId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignment Groups
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/assignment_groups.html#method.assignment_groups.index Canvas} */
  async *listAssignmentGroups({ courseId, query }: { courseId: string; query?: ListAssignmentGroupsQuery }): AsyncGenerator<CanvasAssignmentGroup> {
    const request = this.builder.listAssignmentGroups({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignments
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.show Canvas} */
  async getAssignment({ courseId, assignmentId }: { courseId: string; assignmentId: string }): Promise<CanvasAssignment> {
    const request = this.builder.getAssignment({ courseId, assignmentId })
    return this.http.execute(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.index Canvas} */
  async *listAssignments({ courseId, query }: { courseId: string; query?: ListAssignmentsQuery }): AsyncGenerator<CanvasAssignment> {
    const request = this.builder.listAssignments({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.user_index Canvas} */
  async *listUserAssignments({ userId, courseId, query }: { userId: string; courseId: string; query?: ListUserAssignmentsQuery }): AsyncGenerator<CanvasAssignment> {
    const request = this.builder.listUserAssignments({ userId, courseId, query })
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

  /** @see {@link https://canvas.instructure.com/doc/api/submissions.html#method.submissions_api.index Canvas} */
  async *listSubmissions({ courseId, assignmentId, query }: { courseId: string; assignmentId: string; query?: ListSubmissionsQuery }): AsyncGenerator<CanvasSubmission> {
    const request = this.builder.listSubmissions({ courseId, assignmentId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/submissions.html#method.submissions_api.for_students Canvas} */
  async *listStudentSubmissions({ courseId, query }: { courseId: string; query?: ListStudentSubmissionsQuery }): AsyncGenerator<CanvasSubmission> {
    const request = this.builder.listStudentSubmissions({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  async gradeSubmission({ courseId, assignmentId, userId, payload }: { courseId: string; assignmentId: string; userId: string; payload: CanvasGradeInput }): Promise<CanvasSubmission> {
    const request = this.builder.gradeSubmission({ courseId, assignmentId, userId, payload })
    return this.http.execute(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // External Tools
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/external_tools.html#method.external_tools.index Canvas} */
  async *listExternalTools({ courseId, query }: { courseId: string; query?: ListExternalToolsQuery }): AsyncGenerator<CanvasExternalTool> {
    const request = this.builder.listExternalTools({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Outcomes
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.redirect Canvas} */
  async getRootOutcomeGroup({ courseId }: { courseId: string }): Promise<CanvasOutcomeGroup> {
    const request = this.builder.getRootOutcomeGroup({ courseId })
    return this.http.execute(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.index Canvas} */
  async *listOutcomeGroups({ courseId, query }: { courseId: string; query?: ListOutcomeGroupsQuery }): AsyncGenerator<CanvasOutcomeGroup> {
    const request = this.builder.listOutcomeGroups({ courseId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.outcomes Canvas} */
  async *listOutcomeGroupOutcomes({ courseId, outcomeGroupId, query }: { courseId: string; outcomeGroupId: string; query?: ListOutcomeGroupOutcomesQuery }): AsyncGenerator<CanvasOutcomeLink> {
    const request = this.builder.listOutcomeGroupOutcomes({ courseId, outcomeGroupId, query })
    yield* this.http.executePaginated(request)
  }

  /** @see {@link https://canvas.instructure.com/doc/api/outcomes.html#method.outcomes_api.show Canvas} */
  async getOutcome({ outcomeId }: { outcomeId: string }): Promise<CanvasOutcome> {
    const request = this.builder.getOutcome({ outcomeId })
    return this.http.execute(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Proficiency
  // ═══════════════════════════════════════════════════════════════

  /** @see {@link https://canvas.instructure.com/doc/api/proficiency_ratings.html#method.outcome_proficiency_api.show Canvas} */
  async getOutcomeProficiency({ accountId }: { accountId: string }): Promise<CanvasOutcomeProficiency> {
    const request = this.builder.getOutcomeProficiency({ accountId })
    return this.http.execute(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Modules
  // ═══════════════════════════════════════════════════════════════

  async *listModules({ courseId }: { courseId: string }): AsyncGenerator<CanvasModule> {
    const request = this.builder.listModules({ courseId })
    yield* this.http.executePaginated(request)
  }

  async *listModuleItems({ courseId, moduleId }: { courseId: string; moduleId: string }): AsyncGenerator<CanvasModuleItem> {
    const request = this.builder.listModuleItems({ courseId, moduleId })
    yield* this.http.executePaginated(request)
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
const account = await api.getAccount({ accountId: '1' })

// With query options
const course = await api.getCourse({ courseId: '123', query: { include: ['teachers'] } })
for await (const user of api.listCourseUsers({ courseId: '1', query: { include: ['email'] } })) {
  console.log(user.email)
}

// New endpoints
for await (const section of api.listSections({ courseId: '1' })) {
  console.log(section.name)
}
for await (const group of api.listAssignmentGroups({ courseId: '1', query: { include: ['assignments'] } })) {
  console.log(group.name, group.assignments?.length)
}
for await (const sub of api.listStudentSubmissions({ courseId: '1', query: { studentIds: ['all'] } })) {
  console.log(sub.user_id, sub.score)
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

interface CanvasAccount {
  id: number
  name: string
  parent_account_id: number | null
  root_account_id: number
  workflow_state: 'active' | 'deleted'
  default_storage_quota_mb: number
  default_user_storage_quota_mb: number
}

interface CanvasCourse {
  id: number
  name: string
  course_code: string
  workflow_state: 'unpublished' | 'available' | 'completed' | 'deleted'
  account_id: number
  root_account_id: number
  start_at: string | null
  end_at: string | null
  enrollments?: CanvasEnrollment[]
  total_students?: number
  teachers?: CanvasUser[]
  term?: CanvasEnrollmentTerm
  syllabus_body?: string
  needs_grading_count?: number
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
  locale?: string | null
  last_login?: string | null
}

interface CanvasSection {
  id: number
  name: string
  course_id: number
  sis_section_id: string | null
  start_at: string | null
  end_at: string | null
  total_students?: number
}

interface CanvasEnrollment {
  id: number
  course_id: number
  user_id: number
  type: 'StudentEnrollment' | 'TeacherEnrollment' | 'TaEnrollment' | 'DesignerEnrollment' | 'ObserverEnrollment'
  enrollment_state: 'active' | 'invited' | 'inactive' | 'completed' | 'deleted'
  role: string
  grades?: {
    current_score: number | null
    final_score: number | null
    current_grade: string | null
    final_grade: string | null
  }
  user?: CanvasUser
}

interface CanvasEnrollmentTerm {
  id: number
  name: string
  start_at: string | null
  end_at: string | null
}

interface CanvasGroupCategory {
  id: number
  name: string
  context_type: 'Course' | 'Account'
  group_limit: number | null
  auto_leader: 'first' | 'random' | null
  self_signup: 'enabled' | 'restricted' | null
  groups_count: number
  unassigned_users_count: number
}

interface CanvasGroup {
  id: number
  name: string
  description: string | null
  group_category_id: number
  context_type: 'Course' | 'Account'
  course_id?: number
  members_count: number
  join_level: 'parent_context_auto_join' | 'parent_context_request' | 'invitation_only'
}

interface CanvasAssignmentGroup {
  id: number
  name: string
  position: number
  group_weight: number
  assignments?: CanvasAssignment[]
  rules?: {
    drop_lowest?: number
    drop_highest?: number
    never_drop?: number[]
  }
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
  assignment_group_id: number
  position: number
  course_id: number
  has_submitted_submissions: boolean
  needs_grading_count?: number
}

interface CanvasSubmission {
  id: number
  assignment_id: number
  user_id: number
  submitted_at: string | null
  grade: string | null
  score: number | null
  workflow_state: 'submitted' | 'graded' | 'pending_review' | 'unsubmitted'
  late: boolean
  missing: boolean
  attempt: number | null
  submission_type: string | null
}

interface CanvasExternalTool {
  id: number
  name: string
  description: string | null
  url: string | null
  domain: string | null
  consumer_key: string
  privacy_level: 'anonymous' | 'name_only' | 'email_only' | 'public'
  custom_fields: Record<string, string>
  workflow_state: 'public' | 'anonymous' | 'name_only' | 'email_only'
}

interface CanvasOutcomeGroup {
  id: number
  title: string
  description: string | null
  vendor_guid: string | null
  parent_outcome_group?: { id: number; title: string }
  context_id: number
  context_type: 'Course' | 'Account'
}

interface CanvasOutcome {
  id: number
  title: string
  description: string | null
  display_name: string | null
  vendor_guid: string | null
  points_possible: number
  mastery_points: number
  calculation_method: 'decaying_average' | 'n_mastery' | 'latest' | 'highest' | 'average'
  calculation_int: number | null
  ratings: Array<{ description: string; points: number }>
}

interface CanvasOutcomeLink {
  outcome_group: { id: number; title: string }
  outcome: CanvasOutcome
}

interface CanvasOutcomeProficiency {
  ratings: Array<{
    description: string
    points: number
    mastery: boolean
    color: string
  }>
}

// Canvas-specific types (no generic equivalent)
interface CanvasModule {
  id: number
  name: string
  position: number
  items_count: number
  workflow_state: 'active' | 'deleted'
}

interface CanvasModuleItem {
  id: number
  module_id: number
  title: string
  position: number
  type: 'File' | 'Page' | 'Discussion' | 'Assignment' | 'Quiz' | 'SubHeader' | 'ExternalUrl' | 'ExternalTool'
  content_id: number
  html_url: string
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
    const canvas = await this.api.getCourse({ courseId })
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
  /** OAuth2 client credentials (stored per org, not in env) */
  clientId: string
  clientSecret: string
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
const result = await canvasClient.api.batchUpdateAssignments([
  { courseId: '123', assignmentId: '1', payload: { name: 'Updated 1' } },
  { courseId: '123', assignmentId: '2', payload: { name: 'Updated 2' } },
])
```

## Error handling

All LMS errors use Cella's existing `AppError` class with LMS-specific error keys. See [Configuration Types > Error handling](#error-handling) for the full list of keys and usage patterns.

| Error key | Status | Scenario |
|-----------|--------|----------|
| `lms_rate_limited` | 429 | Rate limit exceeded after retries |
| `lms_token_error` | 401 | Token refresh failed |
| `lms_network_error` | 502 | Network/connection failure |
| `lms_timeout` | 504 | Request timed out |
| `lms_queue_full` | 503 | Scheduler queue at capacity |
| `lms_not_found` | 404 | Canvas resource not found |
| `lms_provider_error` | 500 | Unexpected Canvas error |
| `lms_operation_failed` | 500 | Batch/pagination partial failure |
| `lms_not_configured` | 403 | Organization has no LMS provider |
| `lms_not_connected` | 403 | User has no LMS connection |
| `lms_reauth_required` | 403 | Re-authorization needed |

## Token Management

OAuth2 token handling for Canvas:

1. **Initial connection**: Org admin configures Canvas OAuth app credentials in `lms_providers` table
2. **User authorization**: User completes Canvas OAuth2 flow; access token + refresh token stored in `lms_connections` table
3. **Auto-refresh**: When 401 received, automatically use refresh token (using org-level `client_id`/`client_secret`)
4. **Callback**: `onTokenRefresh` callback to persist new tokens

### Token validation strategy

The API layer and the LMS module have distinct responsibilities:

- **API route level (backend handler)**: Only checks that LMS tokens **exist** in the database — i.e., the user has connected their LMS account. This is a simple DB lookup, not a Canvas API call. No pre-validation of token validity happens here.
- **LMS module level (HttpClient)**: Owns the full token lifecycle. It attaches the `accessToken` to outgoing requests, and on a **401** response automatically attempts a refresh using the `refreshToken`. On success it calls the `onTokenRefresh` callback to persist the new tokens and retries the original request. On failure it throws `AppError(401, 'lms_token_error', 'warn', { meta: { tokenErrorType: 'refresh_failed' } })`.
- **Backend response**: Catches `lms_token_error` and re-throws as `AppError(403, 'lms_reauth_required', 'warn')` so the frontend can prompt re-authorization.
- **Frontend**: Listens for the `lms_reauth_required` error type and redirects the user to the Canvas OAuth2 authorization flow to re-establish the connection.

**Why not pre-validate tokens at the API level?**
- A token can expire between a validation call and the actual request, so pre-validation doesn't guarantee success.
- It adds an unnecessary extra roundtrip to Canvas on every request.
- The LMS module already handles 401s with retry logic, so pre-validation is redundant.

```typescript
// Example: backend handler wiring
async function handleLmsRequest(ctx) {
  // 1. API level: check tokens exist
  const lmsConnection = await db.getLmsConnection(ctx.userId, ctx.orgId)
  if (!lmsConnection) {
    throw new AppError(403, 'lms_not_connected', 'warn')
  }

  // 2. Create client — module owns token refresh internally
  const client = createLmsClient({
    provider: 'canvas',
    baseUrl: lmsConnection.baseUrl,
    accessToken: lmsConnection.accessToken,
    refreshToken: lmsConnection.refreshToken,
    clientId: lmsConnection.clientId,
    clientSecret: lmsConnection.clientSecret,
    onTokenRefresh: async (newTokens) => {
      await db.updateLmsTokens(lmsConnection.id, newTokens)
    },
  })

  try {
    const courses: LmsCourse[] = []
    for await (const course of client.listCourses()) {
      courses.push(course)
    }
    return ctx.json(courses)
  } catch (error) {
    if (error instanceof AppError && error.type === 'lms_token_error') {
      // 3. Refresh failed — tell the frontend to re-authorize
      throw new AppError(403, 'lms_reauth_required', 'warn', { meta: { provider: 'canvas' } })
    }
    throw error
  }
}
```

### Token refresh flow

```typescript
async function handleTokenRefresh(config: LmsClientConfig, refreshToken: string): Promise<TokenPair> {
  const response = await fetch(`${config.baseUrl}/login/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  })
  // ... handle response
}
```

## Implementation Phases

### Phase 1: Foundation
- [ ] Create folder structure (`backend/src/lib/lms/`)
- [ ] Implement `errors.ts` with LMS error keys and helper functions (using `AppError`)
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

## Multi-tenancy

The LMS integration is designed for multi-tenant use where each organization can connect to its own Canvas instance (or share one).

### Data model

Two tables handle the multi-tenant LMS data. Schema files: `backend/src/db/schema/lms-providers.ts` and `backend/src/db/schema/lms-connections.ts`.

#### `lms_providers` — Organization-level LMS configuration

One row per organization's Canvas setup. Stores the OAuth app credentials and the Canvas base URL. An org admin configures this once.

```typescript
// backend/src/db/schema/lms-providers.ts
import { index, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

export const lmsProviderTypes = ['canvas'] as const;
export type LmsProviderType = (typeof lmsProviderTypes)[number];

/** Organization-level LMS provider configuration (OAuth app credentials + base URL). */
export const lmsProvidersTable = pgTable(
  'lms_providers',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
    organizationId: varchar({ length: maxLength.id })
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade' }),
    providerType: varchar({ enum: lmsProviderTypes }).notNull(),
    baseUrl: varchar({ length: maxLength.url }).notNull(),
    clientId: varchar({ length: maxLength.field }).notNull(),
    clientSecret: varchar({ length: maxLength.field }).notNull(),
    displayName: varchar({ length: maxLength.field }),
    createdBy: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'set null' }),
    modifiedAt: timestampColumns.modifiedAt,
    modifiedBy: varchar({ length: maxLength.id }).references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('lms_providers_organization_id_idx').on(table.organizationId),
    unique('lms_providers_org_provider_type').on(table.organizationId, table.providerType),
  ],
);

/** Includes sensitive fields (clientId, clientSecret) — use only in LMS internals. */
export type UnsafeLmsProviderModel = typeof lmsProvidersTable.$inferSelect;
export type InsertLmsProviderModel = typeof lmsProvidersTable.$inferInsert;

/** Safe provider type with credentials omitted for API responses. */
export type LmsProviderModel = Omit<UnsafeLmsProviderModel, 'clientId' | 'clientSecret'>;
```

#### `lms_connections` — User-level OAuth tokens

One row per user who has authorized via OAuth. Stores the user's access and refresh tokens. Created when a user completes the OAuth flow.

```typescript
// backend/src/db/schema/lms-connections.ts
import { index, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { lmsProvidersTable } from '#/db/schema/lms-providers';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/** User-level LMS connection with OAuth tokens. */
export const lmsConnectionsTable = pgTable(
  'lms_connections',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
    lmsProviderId: varchar({ length: maxLength.id })
      .notNull()
      .references(() => lmsProvidersTable.id, { onDelete: 'cascade' }),
    userId: varchar({ length: maxLength.id })
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    accessToken: varchar({ length: maxLength.field }).notNull(),
    refreshToken: varchar({ length: maxLength.field }),
    tokenExpiresAt: timestamp({ mode: 'string' }),
    modifiedAt: timestampColumns.modifiedAt,
  },
  (table) => [
    index('lms_connections_lms_provider_id_idx').on(table.lmsProviderId),
    index('lms_connections_user_id_idx').on(table.userId),
    unique('lms_connections_provider_user').on(table.lmsProviderId, table.userId),
  ],
);

/** Includes sensitive fields (accessToken, refreshToken) — use only in LMS internals. */
export type UnsafeLmsConnectionModel = typeof lmsConnectionsTable.$inferSelect;
export type InsertLmsConnectionModel = typeof lmsConnectionsTable.$inferInsert;

/** Safe connection type with tokens omitted for API responses. */
export type LmsConnectionModel = Omit<UnsafeLmsConnectionModel, 'accessToken' | 'refreshToken'>;
```

#### Design notes

- **`lms_providers`** has a `unique('lms_providers_org_provider_type')` constraint — one Canvas setup per org. If an org later needs a second Canvas instance, the constraint can be relaxed.
- **`lms_connections`** has a `unique('lms_connections_provider_user')` constraint — one token pair per user per provider.
- Both tables use the standard `nanoid` PK, `timestampColumns`, and `maxLength` constraints from Cella's schema utilities.
- `clientId`/`clientSecret` and `accessToken`/`refreshToken` are sensitive — the `Unsafe*` / safe type split follows the same `tokens` and `sessions` pattern in the codebase.
- No `tenantId` column: tenant isolation is enforced through the `organizationId` FK (organizations already carry `tenantId`). RLS policies can join through `organizations` if needed.

This separation means:
- Multiple organizations can connect to the **same** Canvas instance with different OAuth apps
- Multiple organizations can connect to **different** Canvas instances
- Each user within an org has their own token pair
- OAuth app credentials are never exposed to individual users

### How layers handle multi-tenancy

| Layer | Multi-tenant behavior |
|-------|----------------------|
| **RequestScheduler** | Singleton per `base_url`. If two orgs use the same Canvas instance, they share one scheduler — correct, because Canvas rate limits are per-instance. |
| **CanvasHttpClient** | One instance per request/user. Receives `accessToken`, `refreshToken`, `clientId`, `clientSecret` from the handler — all sourced from DB, not env. |
| **Token refresh** | Uses `clientId`/`clientSecret` from `LmsClientConfig` (loaded from `lms_providers`). No env vars needed. |
| **OAuth flow** | Backend reads `client_id` + `base_url` from `lms_providers` to construct the authorization URL. After callback, stores tokens in `lms_connections`. |

### Backend handler flow (multi-tenant)

```typescript
async function handleLmsRequest(ctx) {
  const { userId, orgId } = ctx

  // 1. Load org-level LMS provider config
  const provider = await db.getLmsProvider(orgId)
  if (!provider) {
    throw new AppError(403, 'lms_not_configured', 'warn')
  }

  // 2. Load user-level connection (tokens)
  const connection = await db.getLmsConnection(provider.id, userId)
  if (!connection) {
    throw new AppError(403, 'lms_not_connected', 'warn')
  }

  // 3. Create client with org credentials + user tokens
  const client = createLmsClient({
    provider: provider.providerType,
    baseUrl: provider.baseUrl,
    clientId: provider.clientId,
    clientSecret: provider.clientSecret,
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    onTokenRefresh: async (newTokens) => {
      await db.updateLmsTokens(connection.id, newTokens)
    },
  })

  // 4. Use client (scheduler is shared per base_url automatically)
  try {
    const courses: LmsCourse[] = []
    for await (const course of client.listCourses()) {
      courses.push(course)
    }
    return ctx.json(courses)
  } catch (error) {
    if (error instanceof AppError && error.type === 'lms_token_error') {
      throw new AppError(403, 'lms_reauth_required', 'warn', { meta: { provider: 'canvas' } })
    }
    throw error
  }
}
```

## Configuration

Environment variables (only rate limit defaults — no OAuth credentials):

```env
# Optional: Default rate limit settings
LMS_RATE_LIMIT_REQUESTS_PER_MINUTE=300
LMS_REQUEST_TIMEOUT_MS=30000
```

OAuth credentials (`client_id`, `client_secret`) and Canvas `base_url` are stored per organization in the `lms_providers` table, not in env vars.

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

1. ~~**Token storage**: Where to store LMS tokens? Separate table? Organization settings?~~ → **Decided**: Separate `lms_providers` table (org-level OAuth credentials) and `lms_connections` table (user-level tokens). See [Multi-tenancy](#multi-tenancy) and [Token Management](#token-management).
2. ~~**Multi-tenant**: How to handle multiple Canvas instances per organization?~~ → **Decided**: Each org has its own row in `lms_providers` with `base_url` + `client_id` + `client_secret`. Users authorize per-org. See [Multi-tenancy](#multi-tenancy).
3. **Webhooks**: Should we support Canvas webhooks for real-time updates?
4. **Sync strategy**: One-time fetch vs. periodic sync vs. webhook-driven?
5. **Caching**: Cache course/user data? TTL strategy?
6. **Logging**: How verbose should HTTP client logging be? Integrate with existing Pino logger?
7. **Scheduler persistence**: Should scheduler state survive server restarts? (queue, rate limit budget)
8. ~~**Scheduler scope**: One scheduler per LMS base URL, or per LMS + organization?~~ → **Decided**: Per base URL. Canvas rate limits are per-instance, not per-OAuth-app, so orgs sharing a Canvas instance should share the scheduler. See [Multi-tenancy](#multi-tenancy).
9. **Queue priority**: Should some requests have priority? (e.g., single GET over large batch)
10. **Graceful degradation**: How to handle when queue is full? Reject new requests? Shed load?

## References

### General
- [Canvas REST API Documentation](https://canvas.instructure.com/doc/api/)
- [Canvas OAuth2 Documentation](https://canvas.instructure.com/doc/api/file.oauth.html)
- [Canvas Rate Limiting](https://canvas.instructure.com/doc/api/file.throttling.html)

### Endpoint documentation (initial GET endpoints)

| Category | Endpoint | Canvas docs |
|----------|----------|-------------|
| Accounts | `GET /api/v1/accounts/:id` | [accounts.show](https://canvas.instructure.com/doc/api/accounts.html#method.accounts.show) |
| Accounts | `GET /api/v1/manageable_accounts` | [accounts.manageable_accounts](https://canvas.instructure.com/doc/api/accounts.html#method.accounts.manageable_accounts) |
| Courses | `GET /api/v1/courses/:id` | [courses.show](https://canvas.instructure.com/doc/api/courses.html#method.courses.show) |
| Courses | `GET /api/v1/courses` | [courses.user_index](https://canvas.instructure.com/doc/api/courses.html#method.courses.user_index) |
| Courses | `GET /api/v1/users/:user_id/courses` | [courses.user_index](https://canvas.instructure.com/doc/api/courses.html#method.courses.user_index) |
| Users | `GET /api/v1/users/:id` | [users.api_show](https://canvas.instructure.com/doc/api/users.html#method.users.api_show) |
| Users | `GET /api/v1/accounts/:account_id/users` | [users.api_index](https://canvas.instructure.com/doc/api/users.html#method.users.api_index) |
| Users | `GET /api/v1/courses/:course_id/users` | [courses.users](https://canvas.instructure.com/doc/api/courses.html#method.courses.users) |
| Sections | `GET /api/v1/courses/:course_id/sections` | [sections.index](https://canvas.instructure.com/doc/api/sections.html#method.sections.index) |
| Enrollments | `GET /api/v1/courses/:course_id/enrollments` | [enrollments](https://canvas.instructure.com/doc/api/enrollments.html) |
| Enrollments | `GET /api/v1/users/:user_id/enrollments` | [enrollments](https://canvas.instructure.com/doc/api/enrollments.html) |
| Groups | `GET /api/v1/courses/:course_id/group_categories` | [group_categories.index](https://canvas.instructure.com/doc/api/group_categories.html#method.group_categories.index) |
| Groups | `GET /api/v1/group_categories/:id/groups` | [groups.context_index](https://canvas.instructure.com/doc/api/groups.html#method.groups.context_index) |
| Groups | `GET /api/v1/groups/:group_id/users` | [groups.users](https://canvas.instructure.com/doc/api/groups.html#method.groups.users) |
| Assignment Groups | `GET /api/v1/courses/:course_id/assignment_groups` | [assignment_groups.index](https://canvas.instructure.com/doc/api/assignment_groups.html#method.assignment_groups.index) |
| Assignments | `GET /api/v1/courses/:course_id/assignments/:id` | [assignments_api.show](https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.show) |
| Assignments | `GET /api/v1/courses/:course_id/assignments` | [assignments_api.index](https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.index) |
| Assignments | `GET /api/v1/users/:user_id/courses/:course_id/assignments` | [assignments_api.user_index](https://canvas.instructure.com/doc/api/assignments.html#method.assignments_api.user_index) |
| Submissions | `GET /api/v1/courses/:course_id/assignments/:id/submissions` | [submissions_api.index](https://canvas.instructure.com/doc/api/submissions.html#method.submissions_api.index) |
| Submissions | `GET /api/v1/courses/:course_id/students/submissions` | [submissions_api.for_students](https://canvas.instructure.com/doc/api/submissions.html#method.submissions_api.for_students) |
| External Tools | `GET /api/v1/courses/:course_id/external_tools` | [external_tools.index](https://canvas.instructure.com/doc/api/external_tools.html#method.external_tools.index) |
| Outcomes | `GET /api/v1/courses/:course_id/root_outcome_group` | [outcome_groups_api.redirect](https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.redirect) |
| Outcomes | `GET /api/v1/courses/:course_id/outcome_groups` | [outcome_groups_api.index](https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.index) |
| Outcomes | `GET /api/v1/courses/:course_id/outcome_groups/:id/outcomes` | [outcome_groups_api.outcomes](https://canvas.instructure.com/doc/api/outcome_groups.html#method.outcome_groups_api.outcomes) |
| Outcomes | `GET /api/v1/outcomes/:id` | [outcomes_api.show](https://canvas.instructure.com/doc/api/outcomes.html#method.outcomes_api.show) |
| Proficiency | `GET /api/v1/accounts/:account_id/outcome_proficiency` | [outcome_proficiency_api.show](https://canvas.instructure.com/doc/api/proficiency_ratings.html#method.outcome_proficiency_api.show) |
