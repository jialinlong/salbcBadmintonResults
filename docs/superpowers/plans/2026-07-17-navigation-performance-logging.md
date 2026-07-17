# Navigation Performance Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add correlated client/cloud timing logs for the “记录比赛” and “历史记录” navigation paths without changing business behavior.

**Architecture:** A small client utility owns trace-ID creation and stable `[PERF]` formatting. The two pages attach a trace ID to each cloud request and measure client stages; each cloud function reads that trace ID and measures invocation, database stages, and total time with local helper functions so deployment packaging remains unchanged.

**Tech Stack:** WeChat Mini Program JavaScript, WeChat Cloud Functions, Node.js built-in `node:test` and `node:assert`.

## Global Constraints

- Do not change query order, cache behavior, loading state, return values, or user-visible UI behavior.
- Do not log player names, passwords, teams, scores, full requests, or match details.
- Log only trace IDs, stages, durations, invocation numbers, request types, counts, page numbers, and success/failure metadata.
- Treat `invocation=1` only as a cold-start candidate signal.
- Preserve the user’s existing uncommitted edit in `cloudfunctions/getAllPlayers/index.js`.

---

### Task 1: Tested client performance-log utility

**Files:**
- Create: `miniprogram/utils/perf.js`
- Create: `miniprogram/utils/__tests__/perf.test.js`

**Interfaces:**
- Produces: `createTraceId(scope, now?, random?) -> string`
- Produces: `perfLog(scope, traceId, stage, fields?, logger?) -> string`

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createTraceId, perfLog } = require('../perf')

test('createTraceId creates a stable non-sensitive correlation id', () => {
  assert.equal(createTraceId('match', 123456, 0.5), 'match-123456-i')
})

test('perfLog formats fields and delegates to the provided logger', () => {
  const lines = []
  const line = perfLog('history', 'history-1-a', 'client:request:end', {
    durationMs: 42,
    count: 3
  }, value => lines.push(value))

  assert.equal(line, '[PERF][history][history-1-a] client:request:end durationMs=42 count=3')
  assert.deepEqual(lines, [line])
})

test('perfLog omits undefined fields', () => {
  const line = perfLog('match', 'match-1-a', 'client:error', {
    durationMs: 9,
    error: undefined
  }, () => {})

  assert.equal(line, '[PERF][match][match-1-a] client:error durationMs=9')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test miniprogram/utils/__tests__/perf.test.js`

Expected: FAIL with `Cannot find module '../perf'`.

- [ ] **Step 3: Implement the utility**

```js
function createTraceId(scope, now = Date.now(), random = Math.random()) {
  const randomPart = Math.floor(random * 36).toString(36)
  return `${scope}-${now}-${randomPart}`
}

function perfLog(scope, traceId, stage, fields = {}, logger = console.log) {
  const suffix = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  const line = `[PERF][${scope}][${traceId}] ${stage}${suffix ? ` ${suffix}` : ''}`
  logger(line)
  return line
}

module.exports = { createTraceId, perfLog }
```

- [ ] **Step 4: Run the utility tests and verify GREEN**

Run: `node --test miniprogram/utils/__tests__/perf.test.js`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the utility**

```powershell
git add -- miniprogram/utils/perf.js miniprogram/utils/__tests__/perf.test.js
git commit -m "test: add performance log utility"
```

### Task 2: Client lifecycle and render timing

**Files:**
- Modify: `miniprogram/pages/match/match.js:4-177`
- Modify: `miniprogram/pages/history/history.js:4-271`
- Test: `miniprogram/utils/__tests__/perf.test.js`

**Interfaces:**
- Consumes: `createTraceId(scope)` and `perfLog(scope, traceId, stage, fields)` from Task 1.
- Produces: `traceId` in `getAllPlayers`, `getFilterOptions`, and `getHistoryDays` cloud request data.

- [ ] **Step 1: Add utility imports and lifecycle logs**

In both page files import:

```js
const { createTraceId, perfLog } = require('../../utils/perf')
```

Log `client:onShow` in both pages and `client:onLoad` in history. In `match.checkPermission`, log `client:permission:end granted=true|false` without logging stored values.

- [ ] **Step 2: Instrument `match.fetchPlayers`**

Create one trace ID and timestamps per call, pass `{ traceId }` to `getAllPlayers`, and log:

```js
const traceId = createTraceId('match')
const requestStart = Date.now()
perfLog('match', traceId, 'client:cloud:getAllPlayers:start')
// wx.cloud.callFunction({ name: 'getAllPlayers', data: { traceId } })
perfLog('match', traceId, 'client:cloud:getAllPlayers:end', {
  durationMs: Date.now() - requestStart,
  playerCount: players.length,
  todayMatchCount: todayMatches.length
})
```

Measure `sortAndRender` from entry through the `setData` callback. Extend `sortAndRender(players, traceId)` and use:

```js
const renderStart = Date.now()
// existing transformation remains unchanged
this.setData({ allPlayers: formattedPlayers, filteredPlayers: formattedPlayers }, () => {
  perfLog('match', traceId, 'client:render:end', {
    durationMs: Date.now() - renderStart,
    playerCount: formattedPlayers.length
  })
})
```

Log failures with duration and `errorName`, never the full error object in `[PERF]` output. Preserve the existing `console.error`.

- [ ] **Step 3: Instrument history requests independently**

Generate distinct history trace IDs inside `loadFilterOptions` and `loadHistory`. Pass the ID in each cloud request and log start/end/failure. For history processing, measure `processGroups(rawMatches)` separately and use the final `setData` callback for `client:render:end`:

```js
const processStart = Date.now()
const groups = this.processGroups(rawMatches)
perfLog('history', traceId, 'client:processGroups:end', {
  durationMs: Date.now() - processStart,
  matchCount: rawMatches.length,
  groupCount: groups.length
})
```

Cache-hit logs use a fresh trace ID and stage `client:filterOptions:cache-hit`, with date/player counts only.

- [ ] **Step 4: Verify client code**

Run:

```powershell
node --test miniprogram/utils/__tests__/perf.test.js
node --check miniprogram/pages/match/match.js
node --check miniprogram/pages/history/history.js
```

Expected: 3 tests pass; both syntax checks exit 0.

- [ ] **Step 5: Commit client instrumentation**

```powershell
git add -- miniprogram/pages/match/match.js miniprogram/pages/history/history.js
git commit -m "feat: trace client navigation performance"
```

### Task 3: Cloud invocation and database-stage timing

**Files:**
- Modify: `cloudfunctions/getAllPlayers/index.js:8-47`
- Modify: `cloudfunctions/getMatchStats/index.js:8-300`

**Interfaces:**
- Consumes: optional `event.traceId: string` from Task 2.
- Produces: correlated `[PERF]` cloud logs; cloud return shapes remain unchanged.

- [ ] **Step 1: Add local cloud logging primitives**

At module scope in each cloud function add an instance counter and helpers:

```js
let invocationCount = 0

function fallbackTraceId(scope) {
  return `${scope}-cloud-${Date.now()}-${Math.floor(Math.random() * 36).toString(36)}`
}

function perfLog(scope, traceId, stage, fields = {}) {
  const suffix = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.log(`[PERF][${scope}][${traceId}] ${stage}${suffix ? ` ${suffix}` : ''}`)
}
```

At every `exports.main` entry increment the counter and log `cloud:invoke:start` with `invocation` and request `type` where applicable. On every success/failure return path, log total duration.

- [ ] **Step 2: Time `getAllPlayers` database stages**

Keep both existing queries in their existing order. Record `players-query` and `today-matches-query` start/end durations and counts, then record total duration. Read `event.traceId` with a fallback ID.

- [ ] **Step 3: Thread the history trace context through helper queries**

Change helper signatures to:

```js
async function getAllMatches(condition = {}, perf = null)
async function getMatchesInRange(startDate, endDate, filterPlayer, perf = null)
```

For every pagination batch, log `cloud:matches-batch:end` with `durationMs`, `batch`, `batchCount`, and `totalCount`. Pass `{ scope: 'history', traceId }` from `getFilterOptions` and `getHistoryDays`; calls from rankings may omit it.

- [ ] **Step 4: Time date aggregation and request totals**

Around `.aggregate()...end()` log `cloud:days-aggregate:end` with duration and returned day count. Log `cloud:invoke:end` before each successful return and `cloud:invoke:error` in the catch with total duration, `invocation`, `type`, and `errorName` only.

- [ ] **Step 5: Verify cloud and complete suite**

Run:

```powershell
node --check cloudfunctions/getAllPlayers/index.js
node --check cloudfunctions/getMatchStats/index.js
node --test miniprogram/utils/__tests__/perf.test.js
git diff --check
```

Expected: syntax checks exit 0; 3 tests pass; `git diff --check` reports no errors apart from any pre-existing line-ending warning.

- [ ] **Step 6: Audit privacy and behavior preservation**

Run:

```powershell
rg -n "\[PERF\]|traceId" miniprogram/pages/match/match.js miniprogram/pages/history/history.js cloudfunctions/getAllPlayers/index.js cloudfunctions/getMatchStats/index.js
git diff -- miniprogram/pages/match/match.js miniprogram/pages/history/history.js cloudfunctions/getAllPlayers/index.js cloudfunctions/getMatchStats/index.js
```

Confirm every `[PERF]` field is allow-listed by Global Constraints and the existing query order, cache calls, loading calls, return objects, and UI state transitions are unchanged.

- [ ] **Step 7: Commit cloud instrumentation**

```powershell
git add -- cloudfunctions/getAllPlayers/index.js cloudfunctions/getMatchStats/index.js
git commit -m "feat: trace cloud query performance"
```
