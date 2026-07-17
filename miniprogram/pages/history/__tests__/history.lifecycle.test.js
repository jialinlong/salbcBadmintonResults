const test = require('node:test')
const assert = require('node:assert/strict')

test('refresh-marked first show starts one filter request', async () => {
  let page
  let filterCalls = 0
  let resetCalls = 0
  let historyCalls = 0
  global.Page = config => { page = config }
  global.getApp = () => ({ globalData: { needRefreshHistory: true } })
  global.wx = {
    getStorageSync: () => null,
    setStorageSync: () => {},
    removeStorageSync: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
    stopPullDownRefresh: () => {}
  }
  delete require.cache[require.resolve('../history')]
  require('../history')

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
