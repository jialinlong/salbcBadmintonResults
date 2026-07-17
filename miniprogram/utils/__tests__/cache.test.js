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
