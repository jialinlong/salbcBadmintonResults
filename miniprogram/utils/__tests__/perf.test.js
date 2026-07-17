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
