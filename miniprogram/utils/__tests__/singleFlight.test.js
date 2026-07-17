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
