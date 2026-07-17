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
