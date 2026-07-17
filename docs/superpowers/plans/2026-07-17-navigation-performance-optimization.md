# Navigation Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the match page cache-first and reduce its view-layer payload, eliminate duplicate history initialization requests, and reduce related cloud-query latency without changing business results.

**Architecture:** Pure utility modules own player normalization and single-flight request coalescing so their behavior is testable outside WeChat. Pages coordinate cache-first/background refresh behavior, while cloud functions preserve response contracts and reduce latency through safe field projection and parallel independent queries.

**Tech Stack:** WeChat Mini Program JavaScript, WeChat Cloud Functions, Node.js built-in `node:test` and `node:assert`.

## Global Constraints

- `matchPlayers` cache TTL is exactly `5 * 60 * 1000` milliseconds.
- Cached data is always refreshed in the background on page entry.
- Cached data older than five minutes is not rendered.
- Do not change match recording, scoring, player selection, history grouping, or filter results.
- Do not log names, passwords, teams, scores, complete requests, or match details.
- Preserve all existing `[PERF]` instrumentation and the user’s pre-existing `.limit(1000)` change.
- Do not automatically commit implementation files because existing uncommitted user and instrumentation changes overlap the target files.

---

### Task 1: Tested normalization, single-flight, and cache primitives

**Files:**
- Create: `miniprogram/utils/playerData.js`
- Create: `miniprogram/utils/singleFlight.js`
- Create: `miniprogram/utils/__tests__/playerData.test.js`
- Create: `miniprogram/utils/__tests__/singleFlight.test.js`
- Create: `miniprogram/utils/__tests__/cache.test.js`
- Modify: `miniprogram/utils/cache.js:6-22`

**Interfaces:**
- Produces: `normalizePlayers(players, activeNamesSet, fallbackToPinyin) -> Player[]`
- Produces: `createSingleFlight(onDeduplicated?) -> { run(task): Promise, isRunning(): boolean }`
- Produces cache type: `matchPlayers` with five-minute TTL.

- [ ] **Step 1: Write failing normalization tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePlayers } = require('../playerData')

test('normalizePlayers reuses stored pinyin fields', () => {
  let fallbackCalls = 0
  const result = normalizePlayers([
    { _id: '1', name: '张三', fullPinyin: 'zhangsan', firstLetters: 'zs' }
  ], new Set(), () => {
    fallbackCalls++
    return { fullPinyin: 'wrong', firstLetters: 'w' }
  })

  assert.equal(fallbackCalls, 0)
  assert.equal(result[0].fullPinyin, 'zhangsan')
  assert.equal(result[0].firstLetters, 'zs')
  assert.equal(result[0].displayName, '张三')
})

test('normalizePlayers fills missing pinyin and puts active players first', () => {
  const result = normalizePlayers([
    { _id: '1', name: '李四' },
    { _id: '2', name: '王五', fullPinyin: 'wangwu', firstLetters: 'ww' }
  ], new Set(['王五']), name => ({ fullPinyin: `py-${name}`, firstLetters: 'ls' }))

  assert.deepEqual(result.map(player => player._id), ['2', '1'])
  assert.equal(result[0].displayName, '🔥 王五')
  assert.equal(result[1].fullPinyin, 'py-李四')
})
```

- [ ] **Step 2: Write failing single-flight tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createSingleFlight } = require('../singleFlight')

test('single flight runs one task for concurrent callers', async () => {
  let calls = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const flight = createSingleFlight()
  const task = async () => { calls++; await gate; return 'done' }

  const first = flight.run(task)
  const second = flight.run(task)
  await Promise.resolve()
  assert.equal(calls, 1)
  release()
  assert.deepEqual(await Promise.all([first, second]), ['done', 'done'])
})

test('single flight clears rejected tasks so callers can retry', async () => {
  const flight = createSingleFlight()
  await assert.rejects(flight.run(async () => { throw new Error('fail') }))
  assert.equal(await flight.run(async () => 'retried'), 'retried')
})
```

- [ ] **Step 3: Write failing cache TTL test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')

test('matchPlayers cache expires after five minutes', () => {
  const storage = new Map()
  global.wx = {
    setStorageSync: (key, value) => storage.set(key, value),
    getStorageSync: key => storage.get(key),
    removeStorageSync: key => storage.delete(key)
  }
  delete require.cache[require.resolve('../cache')]
  const { setCache, getCache } = require('../cache')
  setCache('matchPlayers', { players: [], todayMatches: [] })
  const entry = storage.get('cache_match_players')
  assert.equal(entry.ttl, 5 * 60 * 1000)
  entry.timestamp -= entry.ttl + 1
  assert.equal(getCache('matchPlayers'), null)
})
```

- [ ] **Step 4: Run tests and verify RED**

Run:

```powershell
node --test miniprogram/utils/__tests__/playerData.test.js miniprogram/utils/__tests__/singleFlight.test.js miniprogram/utils/__tests__/cache.test.js
```

Expected: FAIL because `playerData`, `singleFlight`, and `matchPlayers` do not exist.

- [ ] **Step 5: Implement normalization and single-flight helpers**

```js
// miniprogram/utils/playerData.js
function normalizePlayers(players, activeNamesSet, fallbackToPinyin) {
  return [...(players || [])]
    .sort((a, b) => Number(activeNamesSet.has(b.name)) - Number(activeNamesSet.has(a.name)))
    .map(player => {
      const fallback = player.fullPinyin && player.firstLetters
        ? null
        : fallbackToPinyin(player.name)
      return {
        ...player,
        displayName: activeNamesSet.has(player.name) ? `🔥 ${player.name}` : player.name,
        fullPinyin: player.fullPinyin || fallback.fullPinyin,
        firstLetters: player.firstLetters || fallback.firstLetters
      }
    })
}

module.exports = { normalizePlayers }
```

```js
// miniprogram/utils/singleFlight.js
function createSingleFlight(onDeduplicated = () => {}) {
  let current = null
  return {
    run(task) {
      if (current) {
        onDeduplicated()
        return current
      }
      current = Promise.resolve().then(task)
      current = current.finally(() => { current = null })
      return current
    },
    isRunning() {
      return current !== null
    }
  }
}

module.exports = { createSingleFlight }
```

Add to `CACHE_CONFIG`:

```js
matchPlayers: {
  key: 'cache_match_players',
  ttl: 5 * 60 * 1000
}
```

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test miniprogram/utils/__tests__/*.test.js`

Expected: all existing perf tests and five new tests pass.

- [ ] **Step 7: Checkpoint without commit**

Run: `git diff --check` and inspect only Task 1 files. Do not stage or commit.

### Task 2: Cache-first match page with minimal view data

**Files:**
- Modify: `miniprogram/pages/match/match.js:4-420`
- Modify: `miniprogram/pages/addPlayer/index.js:139-165`
- Test: `miniprogram/utils/__tests__/playerData.test.js`
- Test: `miniprogram/utils/__tests__/singleFlight.test.js`

**Interfaces:**
- Consumes: `normalizePlayers`, `createSingleFlight`, `getCache`, `setCache`, `clearCache`.
- Produces: cache-first `fetchPlayers({ forceRefresh?, showSpinner? }) -> Promise`.

- [ ] **Step 1: Initialize non-reactive player state and a single-flight request**

Import the Task 1 helpers and cache functions. Remove `allPlayers` from `data`, then initialize alongside `activeNamesSet`:

```js
allPlayers: [],
playersFlight: null,

onLoad() {
  this.playersFlight = createSingleFlight(() => {
    perfLog('match', this.pageTraceId || createTraceId('match'), 'client:refresh:deduplicated')
  })
},
```

Use a lazy `getPlayersFlight()` fallback so tests or lifecycle edge cases cannot call `fetchPlayers` before `onLoad`:

```js
getPlayersFlight() {
  if (!this.playersFlight) this.onLoad()
  return this.playersFlight
},
```

- [ ] **Step 2: Replace `sortAndRender` with logic-layer normalization**

Implement `applyPlayersData(players, todayMatches, traceId, source)` to rebuild `activeNamesSet`, call `normalizePlayers`, assign `this.allPlayers`, and only call `setData({ filteredPlayers })` when `showPlayerModal` is true. Log `client:normalizePlayers:end`; log `client:setData:end` only from a real `setData` callback.

All empty-data paths assign `this.allPlayers = []` and update the view only if the modal is open.

- [ ] **Step 3: Implement stale-while-revalidate fetch flow**

At `fetchPlayers` entry, read `matchPlayers` unless `forceRefresh` is true. On a hit:

```js
this.applyPlayersData(cached.players, cached.todayMatches, traceId, 'cache')
perfLog('match', traceId, 'client:cache-hit', {
  playerCount: cached.players.length,
  todayMatchCount: cached.todayMatches.length
})
```

Then always use `getPlayersFlight().run(async () => { ... })` for the cloud request. Show blocking Loading only when there was no cache and `showSpinner !== false`. On success, call `setCache('matchPlayers', { players, todayMatches })` and apply fresh data. On failure with cache, retain data and show a non-blocking error; without cache, preserve current error behavior.

- [ ] **Step 4: Move all non-rendered lookups to `this.allPlayers`**

Update `getAvailablePlayers` and `selectRecommendedPartner` to read `this.allPlayers`. `openPlayerPicker` remains responsible for putting the filtered list into `data.filteredPlayers`.

- [ ] **Step 5: Remove delayed refresh and invalidate after adding a player**

Replace:

```js
setTimeout(() => this.fetchPlayers(), 500)
```

with:

```js
this.fetchPlayers({ forceRefresh: true, showSpinner: false })
```

After `playersCollection.add` succeeds in `addPlayer/index.js`, call `clearCache('matchPlayers')` before the success toast/navigation path.

- [ ] **Step 6: Verify Task 2**

Run:

```powershell
node --test miniprogram/utils/__tests__/*.test.js
node --check miniprogram/pages/match/match.js
node --check miniprogram/pages/addPlayer/index.js
```

Expected: all tests pass and syntax checks exit 0.

- [ ] **Step 7: Checkpoint without commit**

Inspect the diff and confirm WXML still consumes only `filteredPlayers`, while `allPlayers` exists only as `this.allPlayers` in JavaScript.

### Task 3: Deduplicated history initialization and projected filter query

**Files:**
- Modify: `miniprogram/pages/history/history.js:28-320`
- Modify: `cloudfunctions/getMatchStats/index.js:26-220`
- Create: `miniprogram/pages/history/__tests__/history.lifecycle.test.js`

**Interfaces:**
- Consumes: `createSingleFlight`.
- Produces: one filter request per initial/refresh lifecycle event.

- [ ] **Step 1: Write failing lifecycle test**

Load `history.js` with stubbed globals, replace `loadFilterOptions`, `resetData`, and `loadHistory` with counters, then assert:

```js
test('refresh-marked first show starts one filter request', async () => {
  page.loadFilterOptions = async () => { filterCalls++ }
  page.resetData = () => { resetCalls++ }
  page.loadHistory = async () => { historyCalls++ }
  page.onLoad()
  page.onShow()
  await Promise.resolve()
  assert.equal(filterCalls, 1)
  assert.equal(resetCalls, 1)
  assert.equal(historyCalls, 1)
})
```

The stubbed `getApp()` returns `{ globalData: { needRefreshHistory: true } }`; `Page(config)` captures `config`; `wx` supplies storage and loading no-ops.

- [ ] **Step 2: Run lifecycle test and verify RED**

Run: `node --test miniprogram/pages/history/__tests__/history.lifecycle.test.js`

Expected: FAIL because current `onLoad` and refresh-marked `onShow` both invoke the replaced `loadFilterOptions`, producing `filterCalls === 2`.

- [ ] **Step 3: Consolidate lifecycle loading**

Make `onLoad` log only. In `onShow`, consume `needRefreshHistory` once, determine `firstShow = !this.hasInitialized`, and trigger one filter load plus one history load for first-show or refresh cases. Set `this.hasInitialized = true` before starting asynchronous work.

For pull-to-refresh:

```js
this.resetData()
Promise.all([
  this.loadFilterOptions(true),
  this.loadHistory()
]).finally(() => wx.stopPullDownRefresh())
```

- [ ] **Step 4: Add single-flight filter loading**

Create/lazily obtain a filter flight and wrap the cloud request portion of `loadFilterOptions`. Cache hits return before the flight. Concurrent forced calls share the running request and log `client:refresh:deduplicated`.

- [ ] **Step 5: Project only filter-option fields**

Change `getAllMatches` to accept `fields = null`. Build the ordered query first, conditionally apply `.field(fields)`, then paginate. Call it from `getFilterOptions` with:

```js
const FILTER_OPTION_FIELDS = {
  createTime: true,
  teamA: true,
  teamB: true
}
const allMatches = await getAllMatches({}, perf, FILTER_OPTION_FIELDS)
```

Ranking calls pass no projection and retain all fields required for score calculations.

- [ ] **Step 6: Verify Task 3**

Run:

```powershell
node --test miniprogram/pages/history/__tests__/history.lifecycle.test.js miniprogram/utils/__tests__/*.test.js
node --check miniprogram/pages/history/history.js
node --check cloudfunctions/getMatchStats/index.js
```

Expected: lifecycle test and all utility tests pass; syntax checks exit 0.

- [ ] **Step 7: Checkpoint without commit**

Inspect the diff and confirm `getRankings` still receives full match documents and the refresh flag is cleared once.

### Task 4: Parallel `getAllPlayers` queries and final verification

**Files:**
- Create: `cloudfunctions/getAllPlayers/queries.js`
- Create: `cloudfunctions/getAllPlayers/queries.test.js`
- Modify: `cloudfunctions/getAllPlayers/index.js:32-62`

**Interfaces:**
- Produces: `loadPlayersAndMatches(loadPlayers, loadMatches) -> Promise<[playersResult, matchesResult]>`.

- [ ] **Step 1: Write failing parallelism test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadPlayersAndMatches } = require('./queries')

test('starts both independent queries before either resolves', async () => {
  const started = []
  let releasePlayers
  let releaseMatches
  const playersGate = new Promise(resolve => { releasePlayers = resolve })
  const matchesGate = new Promise(resolve => { releaseMatches = resolve })
  const promise = loadPlayersAndMatches(
    async () => { started.push('players'); await playersGate; return { data: ['p'] } },
    async () => { started.push('matches'); await matchesGate; return { data: ['m'] } }
  )
  await Promise.resolve()
  assert.deepEqual(started, ['players', 'matches'])
  releasePlayers()
  releaseMatches()
  assert.deepEqual(await promise, [{ data: ['p'] }, { data: ['m'] }])
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test cloudfunctions/getAllPlayers/queries.test.js`

Expected: FAIL because `queries.js` does not exist.

- [ ] **Step 3: Implement and integrate parallel query helper**

```js
// cloudfunctions/getAllPlayers/queries.js
function loadPlayersAndMatches(loadPlayers, loadMatches) {
  return Promise.all([loadPlayers(), loadMatches()])
}

module.exports = { loadPlayersAndMatches }
```

In `index.js`, construct the existing player and match query callbacks and pass them to `loadPlayersAndMatches`. Keep the existing query conditions, `.limit(1000)`, match field projection, response object, and `[PERF]` counts. Record individual durations from a common pre-query timestamp or add start timestamps inside each callback.

- [ ] **Step 4: Run all tests and syntax checks**

Run:

```powershell
node --test miniprogram/utils/__tests__/*.test.js miniprogram/pages/history/__tests__/history.lifecycle.test.js cloudfunctions/getAllPlayers/queries.test.js
node --check miniprogram/utils/playerData.js
node --check miniprogram/utils/singleFlight.js
node --check miniprogram/pages/match/match.js
node --check miniprogram/pages/history/history.js
node --check miniprogram/pages/addPlayer/index.js
node --check cloudfunctions/getAllPlayers/index.js
node --check cloudfunctions/getMatchStats/index.js
git diff --check
```

Expected: all tests pass, all syntax checks exit 0, and diff check reports no errors apart from pre-existing line-ending warnings.

- [ ] **Step 5: Audit behavior, cache invalidation, and logs**

Run `rg -n "matchPlayers|allPlayers|loadFilterOptions|Promise.all|FILTER_OPTION_FIELDS|\[PERF\]"` across changed files. Confirm:

- no `data.allPlayers` remains;
- add-player invalidates `matchPlayers`;
- record success performs one immediate non-blocking refresh;
- first history show performs one filter request;
- ranking data is not projected;
- no sensitive data appears in performance logs.

- [ ] **Step 6: Hand off uncommitted implementation for runtime verification**

Report modified files and ask the user to redeploy `getAllPlayers` and `getMatchStats`, then reproduce cold entry, cached entry, record-then-history, and repeated entry. Do not commit overlapping implementation changes automatically.
