# Sync engine performance testing plan

This document outlines the performance testing strategy for Cella's hybrid sync engine. The approach is inspired by [LiveStore's perf tests](https://github.com/livestorejs/livestore/blob/main/tests/perf/README.md) and adapted to Cella's architecture.

## Goals

1. **Identify bugs** - memory leaks, crashes, race conditions, unresponsive UI
2. **Find optimization opportunities** - bottlenecks in sync flow, edge cases
3. **Prevent regressions** - compare between commits, set performance baselines
4. **Guide architecture decisions** - validate design choices with data
5. **Set user expectations** - document system limits and typical latencies

---

## Measurements

### Latency

Latency is measured using the [Event Timing API](https://web.dev/articles/custom-metrics#event-timing-api). This API captures the time (rounded to 8ms for privacy) between when the browser receives an interaction event until it paints the next frame.

Each latency test scenario runs **15 times** to reduce outlier impact. We summarize with:
- **Median** - typical performance, resistant to outliers
- **IQR** - variability within core 50% of measurements
- **Min/Max** - full range for boundary detection

### Memory

Memory is measured using Chrome DevTools Protocol `Runtime.getHeapUsage`. This triggers GC before capturing JavaScript heap usage.

Memory tests run **once per scenario** as heap usage is generally stable.

### Sync-specific metrics

| Metric | Description | Measurement method |
|--------|-------------|-------------------|
| **Mutation round-trip** | Time from optimistic update to server confirmation | Custom timing markers |
| **Stream reconnection** | SSE reconnect + catch-up duration | Event timing from disconnect to synced state |
| **Offline queue flush** | Time to sync all pending mutations on reconnect | Queue empty timestamp - reconnect timestamp |
| **Conflict detection** | Time to detect and surface a conflict | Server response with conflict → UI update |

---

## Test infrastructure

### Stack

| Component | Purpose |
|-----------|---------|
| **Playwright** | Browser automation, user interaction simulation |
| **Vitest** | Test runner, assertions |
| **Chrome DevTools Protocol** | Memory measurement, CPU throttling, network conditions |
| **Custom fixtures** | Perf profile recording, measurement collection |

### Test app

A minimal test application that exercises sync functionality:

```
tests/perf/
├── test-app/              # Minimal React app with sync
│   ├── src/
│   │   ├── App.tsx        # Test harness UI
│   │   ├── sync/          # Schema + sync setup
│   │   └── components/    # Test buttons, entity lists
│   ├── vite.config.ts
│   └── package.json
├── tests/
│   ├── fixtures.ts        # Playwright extensions
│   ├── utils.ts           # Helpers, repeatSuite
│   ├── measurements-reporter.ts
│   └── suites/
│       ├── ui-latency.test.ts
│       ├── memory.test.ts
│       ├── sync-latency.test.ts
│       └── offline.test.ts
├── playwright.config.ts
└── README.md
```

### Playwright config

```typescript
// tests/perf/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  workers: 1, // Serial execution for consistent measurements
  reportSlowTests: null,
  reporter: [
    process.env.CI ? ['dot'] : ['line'],
    ['./tests/measurements-reporter.ts']
  ],
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm test-app',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
```

### Test fixtures

```typescript
// tests/perf/tests/fixtures.ts
import { test as base, type CDPSession } from '@playwright/test'

type PerfFixtures = {
  forEachTest: undefined
  cdpSession: CDPSession
}

export const test = base.extend<PerfFixtures>({
  forEachTest: [
    async ({ page, browser }, use, testInfo) => {
      const shouldProfile = process.env.PERF_PROFILER === '1'
      if (shouldProfile) {
        await browser.startTracing(page, { 
          path: testInfo.outputPath('perf-profile.json') 
        })
      }

      await use(undefined)

      if (shouldProfile) {
        await browser.stopTracing()
      }
    },
    { auto: true },
  ],

  cdpSession: async ({ context, page }, use) => {
    const session = await context.newCDPSession(page)
    await use(session)
  },
})

// Memory measurement helper
export const getHeapUsage = async (cdp: CDPSession): Promise<number> => {
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  return usedSize
}

// Request GC helper (exposed via page)
declare global {
  interface Window {
    gc?: () => void
  }
}
```

### Test pattern

```typescript
// Standard test structure
test('for syncing N mutations', async ({ page, context, cdpSession }, testInfo) => {
  // 1. Warmup - prime caches, avoid cold-start variance
  await test.step('warmup', async () => {
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('create-entity').click()
      await expect(page.getByTestId('sync-status')).toHaveText('synced')
    }
  })

  // 2. Prepare - GC, optionally throttle CPU
  await test.step('prepare', async () => {
    await page.evaluate(() => window.gc?.())
    // Optional: amplify bottlenecks
    // await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  })

  // 3. Run - the measured operation
  await test.step('run', async () => {
    const start = Date.now()
    await page.getByTestId('batch-create-1000').click()
    await expect(page.getByTestId('sync-status')).toHaveText('synced')
    const duration = Date.now() - start
    testInfo.annotations.push({ type: 'measurement', description: duration.toString() })
  })
})
```

---

## Test scenarios

### UI latency tests

| Scenario | Description | Setup |
|----------|-------------|-------|
| **Create single entity** | Time to create and render one entity | Warmup with 5 creates |
| **Create 100 entities** | Batch creation latency | Warmup, then batch |
| **Update entity** | Single field update latency | Pre-populate, then update |
| **Delete entity** | Removal from UI latency | Pre-populate, then delete |
| **Filter/search** | Query response time | 1000 entities, then filter |

### Memory tests

| Scenario | Description | Measurement |
|----------|-------------|-------------|
| **After startup** | Baseline heap usage | Fresh page load |
| **After 100 entities** | Memory per entity baseline | Create, measure |
| **After 1000 entities** | Memory scaling | Create, measure |
| **After 10000 entities** | Upper bound / potential leaks | Create, measure |
| **After delete all** | Memory reclaimed properly | Create 1000, delete all, measure |

### Sync latency tests

These tests measure the full sync round-trip through Cella's architecture:

```
Client mutation → API → DB → CDC Worker → WebSocket → Client cache
```

| Scenario | What we measure | How |
|----------|-----------------|-----|
| **Mutation confirmation** | Time from optimistic update to server ACK | Mark timestamps at mutation start and response |
| **Full round-trip** | Mutation → DB → CDC → WS → other client | Two browser contexts, measure end-to-end |
| **Stream initial sync** | Time to receive all activities on connect | Seed data, connect, measure until caught up |
| **Stream reconnection** | SSE drop + reconnect + catch-up time | Force disconnect, measure recovery |
| **Batch sync throughput** | Mutations per second the system handles | Rapid-fire mutations, measure completion rate |
| **Multi-tab broadcast** | Leader → follower broadcast latency | Two tabs, mutation in leader, measure follower |

### Offline scenario tests

| Scenario | What we measure |
|----------|-----------------|
| **Offline mutation queue** | Mutations queued correctly while offline |
| **Queue persistence** | Queue survives page reload |
| **Queue flush on reconnect** | Time to sync all pending mutations |
| **Queue size limits** | Behavior at 100, 1000, 10000 pending mutations |
| **Conflict on flush** | Handling when queued mutations conflict with server state |
| **Partial flush failure** | Recovery when some mutations fail during flush |

---

## Test implementations

### Sync latency tests

```typescript
// tests/perf/tests/suites/sync-latency.test.ts

test.describe('Sync latency', () => {
  test('mutation round-trip', async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page.getByTestId('sync-status')).toHaveText('connected')

    // Inject timing measurement
    const roundTrip = await page.evaluate(async () => {
      const start = performance.now()
      
      // Trigger mutation (assumes exposed test helper)
      await window.__testHelpers__.createEntity({ title: 'Perf test' })
      
      // Wait for confirmation (not just optimistic)
      await window.__testHelpers__.waitForConfirmation()
      
      return performance.now() - start
    })

    testInfo.annotations.push({ 
      type: 'measurement', 
      description: roundTrip.toString() 
    })
  })

  test('cross-client sync latency', async ({ browser }, testInfo) => {
    // Two browser contexts simulating two users
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    await page1.goto('/')
    await page2.goto('/')
    
    // Both connected
    await expect(page1.getByTestId('sync-status')).toHaveText('connected')
    await expect(page2.getByTestId('sync-status')).toHaveText('connected')

    // Measure: mutation on page1 → appears on page2
    const syncLatency = await page1.evaluate(async () => {
      const id = crypto.randomUUID()
      const start = performance.now()
      
      await window.__testHelpers__.createEntity({ 
        id, 
        title: `Sync test ${id}` 
      })
      
      // Signal to page2 that entity was created
      return { id, start }
    })

    // Wait for entity to appear on page2
    await expect(
      page2.getByTestId(`entity-${syncLatency.id}`)
    ).toBeVisible({ timeout: 10000 })

    const end = await page2.evaluate(() => performance.now())
    const latency = end - syncLatency.start

    testInfo.annotations.push({ 
      type: 'measurement', 
      description: latency.toString() 
    })

    await context1.close()
    await context2.close()
  })

  test('SSE reconnection recovery', async ({ page, context }, testInfo) => {
    await page.goto('/')
    await expect(page.getByTestId('sync-status')).toHaveText('connected')

    // Create some entities while connected
    await page.getByTestId('batch-create-10').click()
    await expect(page.getByTestId('entity-count')).toHaveText('10')

    // Simulate network drop
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })

    await expect(page.getByTestId('sync-status')).toHaveText('disconnected')

    // Create entities while offline (simulated by another process or seed)
    // ... seed 50 more entities directly to DB ...

    // Measure reconnection + catch-up
    const start = Date.now()
    
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })

    await expect(page.getByTestId('sync-status')).toHaveText('connected')
    await expect(page.getByTestId('entity-count')).toHaveText('60')

    const recoveryTime = Date.now() - start
    testInfo.annotations.push({ 
      type: 'measurement', 
      description: recoveryTime.toString() 
    })
  })

  test('leader election latency', async ({ browser }, testInfo) => {
    const context = await browser.newContext()
    const tab1 = await context.newPage()
    const tab2 = await context.newPage()

    await tab1.goto('/')
    await tab2.goto('/')

    // Tab1 should be leader
    await expect(tab1.getByTestId('is-leader')).toHaveText('true')
    await expect(tab2.getByTestId('is-leader')).toHaveText('false')

    // Close leader tab, measure election time
    const start = Date.now()
    await tab1.close()

    await expect(tab2.getByTestId('is-leader')).toHaveText('true')
    const electionTime = Date.now() - start

    testInfo.annotations.push({ 
      type: 'measurement', 
      description: electionTime.toString() 
    })
  })

  test('leader broadcast latency', async ({ browser }, testInfo) => {
    const context = await browser.newContext()
    const leader = await context.newPage()
    const follower = await context.newPage()

    await leader.goto('/')
    await follower.goto('/')

    // Leader creates entity
    const { id } = await leader.evaluate(async () => {
      const id = crypto.randomUUID()
      await window.__testHelpers__.createEntity({ id, title: 'Broadcast test' })
      return { id }
    })

    // Measure when follower sees it (via BroadcastChannel, not SSE)
    const start = Date.now()
    await expect(follower.getByTestId(`entity-${id}`)).toBeVisible()
    const broadcastLatency = Date.now() - start

    testInfo.annotations.push({ 
      type: 'measurement', 
      description: broadcastLatency.toString() 
    })
  })
})
```

### Offline scenario tests

```typescript
// tests/perf/tests/suites/offline.test.ts

test.describe('Offline scenarios', () => {
  test('mutations queue while offline', async ({ page, context }) => {
    await page.goto('/')
    await expect(page.getByTestId('sync-status')).toHaveText('connected')

    // Go offline
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    
    await expect(page.getByTestId('sync-status')).toHaveText('offline')

    // Create entities while offline
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('create-entity').click()
    }

    // Verify queue count
    await expect(page.getByTestId('pending-count')).toHaveText('10')

    // Entities should appear in UI (optimistic)
    await expect(page.getByTestId('entity-count')).toHaveText('10')
  })

  test('queue persists across reload', async ({ page, context }) => {
    await page.goto('/')
    
    // Go offline and create mutations
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('create-entity').click()
    }
    
    await expect(page.getByTestId('pending-count')).toHaveText('5')

    // Reload page (still offline)
    await page.reload()

    // Queue should be restored from IndexedDB
    await expect(page.getByTestId('pending-count')).toHaveText('5')
    await expect(page.getByTestId('entity-count')).toHaveText('5')
  })

  test('queue flush latency', async ({ page, context }, testInfo) => {
    await page.goto('/')
    
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })

    // Queue 100 mutations
    await page.getByTestId('batch-create-100').click()
    await expect(page.getByTestId('pending-count')).toHaveText('100')

    // Go online and measure flush time
    const start = Date.now()
    
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

    await expect(page.getByTestId('pending-count')).toHaveText('0')
    await expect(page.getByTestId('sync-status')).toHaveText('connected')

    const flushTime = Date.now() - start
    testInfo.annotations.push({ 
      type: 'measurement', 
      description: flushTime.toString() 
    })
  })

  test('queue size limits - 1000 mutations', async ({ page, context }, testInfo) => {
    await page.goto('/')
    
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })

    // Measure memory before
    const memBefore = await cdp.send('Runtime.getHeapUsage')

    // Queue 1000 mutations
    await page.getByTestId('batch-create-1000').click()
    await expect(page.getByTestId('pending-count')).toHaveText('1000')

    // Measure memory after
    const memAfter = await cdp.send('Runtime.getHeapUsage')

    const memoryPerMutation = (memAfter.usedSize - memBefore.usedSize) / 1000
    testInfo.annotations.push({ 
      type: 'memory-per-mutation', 
      description: memoryPerMutation.toString() 
    })

    // Go online and verify all flush successfully
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    
    await expect(page.getByTestId('pending-count')).toHaveText('0', { timeout: 60000 })
  })

  test('conflict detection on flush', async ({ page, context, browser }) => {
    // Create entity while online
    await page.goto('/')
    await page.getByTestId('create-entity').click()
    const entityId = await page.getByTestId('last-entity-id').textContent()

    // Go offline and update the entity
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })

    await page.getByTestId(`edit-${entityId}`).click()
    await page.getByTestId('title-input').fill('Offline update')
    await page.getByTestId('save').click()

    // Meanwhile, another client updates the same entity
    const context2 = await browser.newContext()
    const page2 = await context2.newPage()
    await page2.goto('/')
    
    await page2.getByTestId(`edit-${entityId}`).click()
    await page2.getByTestId('title-input').fill('Other client update')
    await page2.getByTestId('save').click()
    await expect(page2.getByTestId('sync-status')).toHaveText('connected')
    await context2.close()

    // Original client goes online - should detect conflict
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

    // Verify conflict is surfaced
    await expect(page.getByTestId('conflict-indicator')).toBeVisible()
    await expect(page.getByTestId(`conflict-${entityId}`)).toBeVisible()
  })

  test('partial flush failure recovery', async ({ page, context }) => {
    await page.goto('/')
    
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })

    // Queue mutations including one that will fail (e.g., validation error)
    await page.getByTestId('create-valid-entity').click()
    await page.getByTestId('create-invalid-entity').click() // Will fail on server
    await page.getByTestId('create-valid-entity').click()

    await expect(page.getByTestId('pending-count')).toHaveText('3')

    // Go online
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

    // Should process valid ones, report failed one
    await expect(page.getByTestId('pending-count')).toHaveText('0')
    await expect(page.getByTestId('failed-mutations')).toHaveText('1')
    await expect(page.getByTestId('entity-count')).toHaveText('2') // Only valid ones
  })
})
```

### Network condition simulation

```typescript
// Utility for simulating various network conditions
const networkConditions = {
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  slow3g: { offline: false, latency: 400, downloadThroughput: 400 * 1024, uploadThroughput: 400 * 1024 },
  fast3g: { offline: false, latency: 100, downloadThroughput: 1.5 * 1024 * 1024, uploadThroughput: 750 * 1024 },
  flaky: { offline: false, latency: 200, downloadThroughput: 500 * 1024, uploadThroughput: 500 * 1024 },
  online: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
}

test('sync under slow network', async ({ page, context }, testInfo) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.emulateNetworkConditions', networkConditions.slow3g)

  await page.goto('/')
  
  const start = Date.now()
  await page.getByTestId('batch-create-10').click()
  await expect(page.getByTestId('sync-status')).toHaveText('synced')
  
  const syncTime = Date.now() - start
  testInfo.annotations.push({ type: 'slow-3g-sync', description: syncTime.toString() })
})
```

---

## Running tests

```bash
# Run all perf tests
pnpm --filter tests-perf test

# Run with profiler (generates perf-profile.json per test)
PERF_PROFILER=1 pnpm --filter tests-perf test

# Run specific suite
pnpm --filter tests-perf test sync-latency

# Local development (reuses server)
pnpm --filter tests-perf test:dev
```

---

## CI integration

### GitHub Actions workflow

```yaml
# .github/workflows/perf-tests.yml
name: Performance Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
      
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'
      
      - run: pnpm install
      
      - name: Start services
        run: docker compose up -d postgres
      
      - name: Run perf tests
        run: pnpm --filter tests-perf test
        env:
          CI: true
          COMMIT_SHA: ${{ github.sha }}
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: perf-results
          path: tests/perf/test-results/
```

### Measurements reporter

```typescript
// tests/perf/tests/measurements-reporter.ts
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

class MeasurementsReporter implements Reporter {
  private measurements: Map<string, number[]> = new Map()

  onTestEnd(test: TestCase, result: TestResult) {
    for (const annotation of result.annotations) {
      if (annotation.type === 'measurement') {
        const key = test.title
        const value = Number.parseFloat(annotation.description ?? '0')
        
        if (!this.measurements.has(key)) {
          this.measurements.set(key, [])
        }
        this.measurements.get(key)!.push(value)
      }
    }
  }

  onEnd() {
    // Output measurements as JSON for CI to consume
    const results = Object.fromEntries(
      [...this.measurements.entries()].map(([key, values]) => [
        key,
        {
          median: this.median(values),
          min: Math.min(...values),
          max: Math.max(...values),
          iqr: this.iqr(values),
        },
      ])
    )
    
    console.info(JSON.stringify(results, null, 2))
    
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  private iqr(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(sorted.length * 0.25)]
    const q3 = sorted[Math.floor(sorted.length * 0.75)]
    return q3 - q1
  }
}

export default MeasurementsReporter
```

---

## Test app requirements

The minimal test app needs to expose:

### UI elements

| Element | TestId | Purpose |
|---------|--------|---------|
| Sync status indicator | `sync-status` | Shows: connected, disconnected, offline, syncing |
| Pending mutations count | `pending-count` | Number of queued offline mutations |
| Entity count | `entity-count` | Total entities in view |
| Is leader indicator | `is-leader` | true/false for multi-tab tests |
| Conflict indicator | `conflict-indicator` | Visible when conflicts exist |

### Test actions

| Element | TestId | Action |
|---------|--------|--------|
| Create single | `create-entity` | Creates one entity |
| Batch create | `batch-create-{n}` | Creates n entities (10, 100, 1000) |
| Edit entity | `edit-{id}` | Opens edit form for entity |
| Delete entity | `delete-{id}` | Deletes entity |
| Clear all | `clear-all` | Removes all entities |
| Reset harness | `reset-harness` | Clears DB and cache |

### Window test helpers

```typescript
// Exposed on window for Playwright to call
declare global {
  interface Window {
    __testHelpers__: {
      createEntity: (data: { id?: string; title: string }) => Promise<void>
      updateEntity: (id: string, data: Partial<Entity>) => Promise<void>
      deleteEntity: (id: string) => Promise<void>
      waitForConfirmation: () => Promise<void>
      getQueueSize: () => number
      forceReconnect: () => void
    }
  }
}
```

---

## Notes

- **Local vs CI results are not comparable** - different hardware, virtualization affects timing
- **CPU throttling amplifies bottlenecks** - use `Emulation.setCPUThrottlingRate` to make issues visible
- **Profile recording impacts performance** - only enable when debugging, not for measurements
- **Warmup is essential** - JIT compilation, cache warming affects first runs significantly
