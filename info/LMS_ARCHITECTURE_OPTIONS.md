# LMS Integration - Architecture Options

This document captures the different architectural options considered for the LMS HTTP client layer. Kept for future reference and potential revisiting of decisions.

**Decision made**: Option C+E (Abstract Base + Request Builder Separation)

---

## The Core Problem

Different LMS providers have different:
- Throttling/rate limit headers (Canvas: `X-Rate-Limit-Remaining`, Moodle: different)
- Pagination mechanisms (Canvas: `Link` header, Moodle: token-based)
- Error response formats
- Authentication methods
- API endpoint structures

How do we design a system that handles these differences cleanly?

---

## Option A: Generic HTTP Client

```
CanvasApi (endpoints) → LmsHttpClient (generic) → RequestScheduler
```

```typescript
class LmsHttpClient {
  // Generic - tries to handle all providers
  get<T>(path, params): Promise<T>
  // Problem: How does it know Canvas vs Moodle pagination/throttling?
}
```

**Pros:**
- Simple, single client class
- Less code

**Cons:**
- ❌ Can't properly handle provider-specific throttling
- ❌ Pagination parsing differs per provider
- ❌ Error parsing differs per provider
- ❌ Would need lots of conditionals

**Verdict**: Not viable for multi-provider support.

---

## Option B: Provider-Specific HTTP Clients (No Shared Base)

```
CanvasApi (endpoints) → CanvasHttpClient → RequestScheduler (shared)
MoodleApi (endpoints) → MoodleHttpClient → RequestScheduler (shared)
```

```typescript
// All implement same interface
interface LmsHttpClient {
  get<T>(path, params): Promise<T>
  post<T>(path, body): Promise<T>
  getPaginated<T>(path, params): AsyncGenerator<T>
  batchGet<T>(requests): Promise<MultiOperationResult<T>>
  // ...
}

class CanvasHttpClient implements LmsHttpClient {
  // Canvas-specific: Link headers, X-Rate-Limit-Remaining
  async get<T>(path, params) {
    const response = await this.fetch(...)
    this.updateRateLimit(this.parseCanvasRateLimit(response.headers))
    return response.json()
  }
  
  private parseCanvasRateLimit(headers: Headers) {
    return {
      remaining: Number(headers.get('X-Rate-Limit-Remaining')),
      cost: Number(headers.get('X-Request-Cost')),
    }
  }
}

class MoodleHttpClient implements LmsHttpClient {
  // Moodle-specific: different headers, token-based pagination
  private parseMoodleRateLimit(headers: Headers) {
    // Different implementation
  }
}
```

**Pros:**
- ✅ Each client handles its own quirks cleanly
- ✅ Same interface, swappable
- ✅ Clear separation

**Cons:**
- ⚠️ Code duplication for common logic (retry, timeout, queue submission)
- ⚠️ Must remember to implement all methods consistently

**Verdict**: Viable, but could be DRYer.

---

## Option C: Abstract Base + Provider Implementations

```
abstract LmsHttpClientBase → CanvasHttpClient → RequestScheduler
                          → MoodleHttpClient → RequestScheduler
```

```typescript
abstract class LmsHttpClientBase {
  constructor(
    protected config: HttpClientConfig,
    protected scheduler: RequestScheduler
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Common logic - implemented once
  // ═══════════════════════════════════════════════════════════════
  
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const response = await this.executeWithRetry('GET', path, { params })
    this.updateRateLimit(this.parseRateLimit(response.headers))
    return response.json()
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.executeWithRetry('POST', path, { body })
    this.updateRateLimit(this.parseRateLimit(response.headers))
    return response.json()
  }

  protected async executeWithRetry(
    method: string,
    path: string,
    options: RequestOptions
  ): Promise<Response> {
    // Common retry logic, timeout handling, scheduler submission
    return this.scheduler.submit({
      method,
      path,
      ...options,
      headers: this.getAuthHeader(),
    })
  }

  // ═══════════════════════════════════════════════════════════════
  // Provider-specific - must implement
  // ═══════════════════════════════════════════════════════════════
  
  protected abstract parseRateLimit(headers: Headers): RateLimitInfo
  protected abstract parsePagination(headers: Headers): PaginationInfo
  protected abstract parseError(response: Response): LmsError
  protected abstract getAuthHeader(): Record<string, string>
}

class CanvasHttpClient extends LmsHttpClientBase {
  protected parseRateLimit(headers: Headers): RateLimitInfo {
    return {
      remaining: Number(headers.get('X-Rate-Limit-Remaining')),
      cost: Number(headers.get('X-Request-Cost')),
    }
  }
  
  protected parsePagination(headers: Headers): PaginationInfo {
    const link = headers.get('Link')
    return parseLinkHeader(link)  // Canvas uses Link header
  }
  
  protected parseError(response: Response): LmsError {
    // Canvas-specific error format
  }
  
  protected getAuthHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.accessToken}` }
  }
}

class MoodleHttpClient extends LmsHttpClientBase {
  protected parseRateLimit(headers: Headers): RateLimitInfo {
    // Moodle-specific implementation
  }
  
  protected parsePagination(headers: Headers): PaginationInfo {
    // Moodle uses token-based pagination
  }
  
  // ...
}
```

**Pros:**
- ✅ DRY - common logic in base class (retry, timeout, queue)
- ✅ Clear contract - abstract methods define what each provider must implement
- ✅ Type-safe - TypeScript enforces implementation
- ✅ Easy to add new providers - just extend base class

**Cons:**
- ⚠️ Inheritance can be rigid
- ⚠️ All providers must fit the base class's structure

**Verdict**: Good balance of DRY and flexibility.

---

## Option D: Strategy/Plugin Pattern

```
LmsHttpClient + CanvasStrategy → RequestScheduler
LmsHttpClient + MoodleStrategy → RequestScheduler
```

```typescript
interface LmsHttpStrategy {
  parseRateLimit(headers: Headers): RateLimitInfo
  parsePagination(headers: Headers): PaginationInfo
  parseError(response: Response): LmsError
  getAuthHeader(token: string): Record<string, string>
  getBaseUrl(): string
}

const canvasStrategy: LmsHttpStrategy = {
  parseRateLimit: (headers) => ({
    remaining: Number(headers.get('X-Rate-Limit-Remaining')),
    cost: Number(headers.get('X-Request-Cost')),
  }),
  
  parsePagination: (headers) => parseLinkHeader(headers.get('Link')),
  
  parseError: (response) => {
    // Canvas error parsing
  },
  
  getAuthHeader: (token) => ({ Authorization: `Bearer ${token}` }),
  
  getBaseUrl: () => '/api/v1',
}

const moodleStrategy: LmsHttpStrategy = {
  // Moodle-specific implementations
}

class LmsHttpClient {
  constructor(private config: {
    strategy: LmsHttpStrategy
    baseUrl: string
    accessToken: string
  }) {}

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const response = await this.execute('GET', path, { params })
    // Uses strategy for provider-specific parsing
    this.updateRateLimit(this.config.strategy.parseRateLimit(response.headers))
    return response.json()
  }
}

// Usage
const canvasClient = new LmsHttpClient({
  strategy: canvasStrategy,
  baseUrl: 'https://school.instructure.com',
  accessToken: 'token',
})
```

**Pros:**
- ✅ Composition over inheritance
- ✅ Strategies can be shared/tested independently
- ✅ Easy to swap strategies at runtime
- ✅ Functional approach (strategies are just objects)

**Cons:**
- ⚠️ Strategy interface must cover all provider needs
- ⚠️ Complex providers might not fit a simple strategy interface
- ⚠️ Less type safety for provider-specific features

**Verdict**: Good for simple differences, may struggle with complex providers.

---

## Option E: Request Builder Separation

This addresses: "Should endpoint preparation be separate from HTTP handling?"

```
CanvasRequestBuilder → CanvasHttpClient → RequestScheduler
     (paths/params)      (HTTP handling)     (concurrency)
```

```typescript
// ═══════════════════════════════════════════════════════════════
// Layer: Request Builder - ONLY knows endpoints and params
// ═══════════════════════════════════════════════════════════════

interface LmsRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  params?: Record<string, string>
  body?: unknown
}

class CanvasRequestBuilder {
  getCourse(courseId: string, include?: string[]): LmsRequest {
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}`,
      params: include ? { include: include.join(',') } : undefined,
    }
  }
  
  createAssignment(courseId: string, data: CreateAssignmentInput): LmsRequest {
    return {
      method: 'POST',
      path: `/api/v1/courses/${courseId}/assignments`,
      body: { assignment: data },
    }
  }
  
  updateAssignment(courseId: string, assignmentId: string, data: UpdateAssignmentInput): LmsRequest {
    return {
      method: 'PUT',
      path: `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
      body: { assignment: data },
    }
  }
  
  listCourseUsers(courseId: string, options?: { 
    enrollmentType?: string[]
    include?: string[] 
  }): LmsRequest {
    const params: Record<string, string> = {}
    if (options?.enrollmentType) {
      params['enrollment_type[]'] = options.enrollmentType.join(',')
    }
    if (options?.include) {
      params['include[]'] = options.include.join(',')
    }
    return {
      method: 'GET',
      path: `/api/v1/courses/${courseId}/users`,
      params: Object.keys(params).length ? params : undefined,
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Layer: HTTP Client - handles execution, throttling, pagination
// ═══════════════════════════════════════════════════════════════

class CanvasHttpClient {
  async execute<T>(request: LmsRequest): Promise<T> {
    // Handle Canvas-specific:
    // - Throttling (X-Rate-Limit-Remaining)
    // - Pagination (Link header)
    // - Error parsing
  }
}

// ═══════════════════════════════════════════════════════════════
// Usage options
// ═══════════════════════════════════════════════════════════════

// Option 1: Separate builder and client
const builder = new CanvasRequestBuilder()
const client = new CanvasHttpClient(config)

const request = builder.getCourse('123', ['total_students'])
const course = await client.execute<CanvasCourse>(request)

// Option 2: Combined in API class
class CanvasApi {
  constructor(
    private builder: CanvasRequestBuilder,
    private http: CanvasHttpClient
  ) {}
  
  async getCourse(courseId: string, include?: string[]): Promise<CanvasCourse> {
    const request = this.builder.getCourse(courseId, include)
    return this.http.execute(request)
  }
}
```

**Pros:**
- ✅ Clear separation of concerns
- ✅ Request builder can be unit tested without HTTP
- ✅ Could generate request builders from OpenAPI specs
- ✅ Builder is pure functions - very testable
- ✅ HTTP client focuses only on execution concerns

**Cons:**
- ⚠️ More files/classes
- ⚠️ Might feel over-engineered for simple cases

**Verdict**: Excellent for maintainability and testing.

---

## Option C+E: Combined (Chosen Approach)

Combines the best of Option C (abstract base) and Option E (request builder).

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LmsClient                                    │
│                   (unified user entry point)                         │
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
│  - knows paths          │     │                                     │
│  - knows params         │     │   - Canvas throttle parsing         │
│  - knows body shapes    │     │   - Canvas pagination (Link header) │
│                         │     │   - Canvas error parsing            │
└─────────────────────────┘     └──────────────────┬──────────────────┘
                                                   │
                                                   ▼
                                ┌─────────────────────────────────────┐
                                │        RequestScheduler             │
                                │   (shared concurrency control)      │
                                └─────────────────────────────────────┘
```

**Why this combination:**
- ✅ Abstract base (Option C) keeps HTTP client logic DRY
- ✅ Request builder (Option E) separates endpoint knowledge from HTTP concerns
- ✅ Clear layers with single responsibilities
- ✅ Each layer is independently testable
- ✅ Easy to add new providers

See [LMS.md](./LMS.md) for full implementation details.

---

## Comparison Summary

| Option | Description | DRY | Testability | Flexibility | Complexity |
|--------|-------------|-----|-------------|-------------|------------|
| **A** | Generic HTTP client | High | Medium | Low | Low |
| **B** | Provider-specific clients | Low | High | High | Medium |
| **C** | Abstract base + impl | High | High | High | Medium |
| **D** | Strategy pattern | High | High | Medium | Medium |
| **E** | Request builder | Medium | Very High | Very High | Medium |
| **C+E** | Combined | High | Very High | Very High | Higher |

---

## When to Reconsider

Consider revisiting this decision if:

1. **Provider differences are minimal**: If it turns out all LMS providers have very similar throttling/pagination, Option A or D might be simpler.

2. **Too much boilerplate**: If adding a new provider requires too many files, consider Option D (strategy pattern).

3. **Request builders become complex**: If request builders need provider-specific HTTP knowledge, the separation might not be clean.

4. **Performance concerns**: If the abstraction layers add measurable overhead, consider flattening.
