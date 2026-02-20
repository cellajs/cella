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

```typescript
interface LmsRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  params?: Record<string, string | string[]>
  body?: unknown
}

class CanvasRequestBuilder {
  // ═══════════════════════════════════════════════════════════════
  // Courses
  // ═══════════════════════════════════════════════════════════════

  getCourse(courseId: string, options?: { include?: CanvasCourseInclude[] }): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}`,
      params: options?.include ? { 'include[]': options.include } : undefined,
    }
  }

  listCourses(options?: CanvasListCoursesOptions): LmsRequest {
    return {
      method: 'GET',
      path: '/api/v1/courses',
      params: this.buildListCoursesParams(options),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════════════════════════

  listCourseUsers(courseId: string, options?: CanvasListUsersOptions): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/users`,
      params: this.buildListUsersParams(options),
    }
  }

  getUser(userId: string): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/users/${userId}`,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignments
  // ═══════════════════════════════════════════════════════════════

  listAssignments(courseId: string, options?: CanvasListAssignmentsOptions): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments`,
      params: options,
    }
  }

  getAssignment(courseId: string, assignmentId: string): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    }
  }

  createAssignment(courseId: string, data: CanvasCreateAssignmentInput): LmsRequest {
    return {
      method: 'POST',
      path: `/api/v1/courses/${courseId}/assignments`,
      body: { assignment: data },
    }
  }

  updateAssignment(courseId: string, assignmentId: string, data: CanvasUpdateAssignmentInput): LmsRequest {
    return {
      method: 'PUT',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
      body: { assignment: data },
    }
  }

  deleteAssignment(courseId: string, assignmentId: string): LmsRequest {
    return {
      method: 'DELETE',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Submissions
  // ═══════════════════════════════════════════════════════════════

  listSubmissions(courseId: string, assignmentId: string): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
    }
  }

  getSubmission(courseId: string, assignmentId: string, userId: string): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
    }
  }

  gradeSubmission(courseId: string, assignmentId: string, userId: string, data: CanvasGradeInput): LmsRequest {
    return {
      method: 'PUT',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      body: { submission: data },
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Canvas-specific endpoints
  // ═══════════════════════════════════════════════════════════════

  listModules(courseId: string): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/modules`,
    }
  }

  listModuleItems(courseId: string, moduleId: string): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/modules/${moduleId}/items`,
    }
  }

  listEnrollments(courseId: string, options?: CanvasListEnrollmentsOptions): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/enrollments`,
      params: options,
    }
  }
}
```

**Benefits of separation:**
- Request builder can be unit tested without any HTTP mocking
- Easy to see all supported endpoints in one place
- Could be auto-generated from OpenAPI specs

---

### Layer 5: Canvas API (`canvas/api.ts`)

Combines Request Builder + HTTP Client. This is what users interact with for raw Canvas data.

```typescript
class CanvasApi {
  constructor(
    private builder: CanvasRequestBuilder,
    private http: CanvasHttpClient
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Courses
  // ═══════════════════════════════════════════════════════════════

  async getCourse(courseId: string, options?: { include?: CanvasCourseInclude[] }): Promise<CanvasCourse> {
    const request = this.builder.getCourse(courseId, options)
    return this.http.execute(request)
  }

  async *listCourses(options?: CanvasListCoursesOptions): AsyncGenerator<CanvasCourse> {
    const request = this.builder.listCourses(options)
    yield* this.http.executePaginated(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════════════════════════

  async *listCourseUsers(courseId: string, options?: CanvasListUsersOptions): AsyncGenerator<CanvasUser> {
    const request = this.builder.listCourseUsers(courseId, options)
    yield* this.http.executePaginated(request)
  }

  async getUser(userId: string): Promise<CanvasUser> {
    const request = this.builder.getUser(userId)
    return this.http.execute(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Assignments
  // ═══════════════════════════════════════════════════════════════

  async *listAssignments(courseId: string, options?: CanvasListAssignmentsOptions): AsyncGenerator<CanvasAssignment> {
    const request = this.builder.listAssignments(courseId, options)
    yield* this.http.executePaginated(request)
  }

  async getAssignment(courseId: string, assignmentId: string): Promise<CanvasAssignment> {
    const request = this.builder.getAssignment(courseId, assignmentId)
    return this.http.execute(request)
  }

  async createAssignment(courseId: string, data: CanvasCreateAssignmentInput): Promise<CanvasAssignment> {
    const request = this.builder.createAssignment(courseId, data)
    return this.http.execute(request)
  }

  async updateAssignment(courseId: string, assignmentId: string, data: CanvasUpdateAssignmentInput): Promise<CanvasAssignment> {
    const request = this.builder.updateAssignment(courseId, assignmentId, data)
    return this.http.execute(request)
  }

  async deleteAssignment(courseId: string, assignmentId: string): Promise<void> {
    const request = this.builder.deleteAssignment(courseId, assignmentId)
    await this.http.execute(request)
  }

  // ═══════════════════════════════════════════════════════════════
  // Batch operations
  // ═══════════════════════════════════════════════════════════════

  async batchUpdateAssignments(
    updates: Array<{ courseId: string; assignmentId: string; data: CanvasUpdateAssignmentInput }>
  ): Promise<MultiOperationResult<CanvasAssignment>> {
    const requests = updates.map(u => this.builder.updateAssignment(u.courseId, u.assignmentId, u.data))
    return this.http.batchExecute(requests)
  }

  // ... more batch methods
}
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
