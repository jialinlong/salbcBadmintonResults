// pages/rank/rank.js
// 优化版本：使用云函数聚合查询 + 本地缓存

const { showError } = require('../../utils/common')
const { getCache, setCache, clearCache } = require('../../utils/cache')

Page({
  data: {
    currentTab: 'month',
    rankList: [],
    
    // 荣誉榜数据
    mostActive: {},
    bestPlayer: {},
    topScorer: {},
    
    // 统计信息
    totalMatches: 0,
    totalPlayers: 0,
    
    // 加载状态
    isLoading: true
  },

  onShow() {
    this.loadRankings()
  },

  // 切换 Tab
  switchTab(e) {
    const type = e.currentTarget.dataset.type
    if (type !== this.data.currentTab) {
      this.setData({ currentTab: type })
      this.loadRankings()
    }
  },

  // 使用云函数加载排行榜数据 + 缓存
  async loadRankings() {
    // 先尝试从缓存读取
    const cacheKey = this.data.currentTab
    const cachedData = getCache('rankings', cacheKey)

    if (cachedData) {
      console.log('✅ 从缓存加载排行榜')
      this.setData({
        ...cachedData,
        isLoading: false
      })
      return
    }

    this.setData({ isLoading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'getMatchStats',
        data: {
          type: 'getRankings',
          tab: this.data.currentTab
        }
      })

      if (res.result.success) {
        const rankData = {
          rankList: res.result.rankList,
          mostActive: res.result.mostActive,
          bestPlayer: res.result.bestPlayer,
          topScorer: res.result.topScorer,
          totalMatches: res.result.totalMatches,
          totalPlayers: res.result.totalPlayers
        }

        // 保存到缓存
        setCache('rankings', rankData, cacheKey)

        this.setData({
          ...rankData,
          isLoading: false
        })

        console.log('排行榜加载完成:', res.result.rankList.length, '人上榜')
      } else {
        this.setData({ isLoading: false })
        showError('加载失败')
      }
    } catch (err) {
      console.error('加载排行榜失败:', err)
      this.setData({ isLoading: false })
      showError('加载失败')
    }
  },

  // 跳转到个人详情页
  goToPlayer(e) {
    const name = e.currentTarget.dataset.name
    if (name) {
      wx.navigateTo({
        url: `/pages/player/player?name=${encodeURIComponent(name)}`
      })
    }
  }
})
