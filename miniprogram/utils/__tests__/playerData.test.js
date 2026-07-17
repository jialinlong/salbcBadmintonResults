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
