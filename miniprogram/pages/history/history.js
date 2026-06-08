// pages/history/history.js
// 支持分页加载的历史记录页面 + 缓存优化

const { formatDate, formatTime, showLoading, hideLoading, showError, calculateMatchPoints } = require('../../utils/common')
const { getCache, setCache, clearCache } = require('../../utils/cache')

Page({
  data: {
    groupedList: [],
    rawMatches: [],

    // 日期筛选
    pickerDates: [],
    currentDate: '',
    pickerIndex: -1,

    // 人名筛选
    playerNames: [],
    currentPlayer: '',
    playerPickerIndex: -1,

    // 加载状态
    isLoading: false
  },

  onLoad() {
    this.loadFilterOptions()
  },

  onShow() {
    const app = getApp()
    // 检查是否需要刷新
    if (app.globalData.needRefreshHistory) {
      app.globalData.needRefreshHistory = false
      this.loadFilterOptions(true)  // 强制刷新筛选选项
      this.resetData()
      this.loadAllHistory()
    } else if (this.data.groupedList.length === 0) {
      this.loadAllHistory()
    }
  },

  onPullDownRefresh() {
    this.loadFilterOptions(true)  // 强制刷新，跳过缓存
    this.resetData()
    this.loadAllHistory().finally(() => wx.stopPullDownRefresh())
  },

  // 使用云函数一次性获取筛选选项 + 缓存
  async loadFilterOptions(forceRefresh = false) {
    // 强制刷新时跳过缓存
    if (!forceRefresh) {
      const cachedOptions = getCache('filterOptions')
      if (cachedOptions) {
        console.log('✅ 从缓存加载筛选选项')
        this.setData({
          pickerDates: cachedOptions.dates,
          playerNames: cachedOptions.players
        })
        return
      }
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'getMatchStats',
        data: { type: 'getFilterOptions' }
      })

      if (res.result.success) {
        const options = {
          dates: res.result.dates,
          players: res.result.players
        }

        // 保存到缓存
        setCache('filterOptions', options)

        this.setData({
          pickerDates: options.dates,
          playerNames: options.players
        })
        console.log('筛选选项加载完成:', res.result.dates.length, '个日期,', res.result.players.length, '位玩家')
      }
    } catch (err) {
      console.error('加载筛选选项失败', err)
    }
  },

  // 日期选择
  onDateChange(e) {
    const index = e.detail.value
    const selectedDateStr = this.data.pickerDates[index]

    this.setData({
      currentDate: selectedDateStr,
      pickerIndex: index
    })

    this.resetData()
    this.loadAllHistory()
  },

  // 人名选择
  onPlayerChange(e) {
    const index = e.detail.value
    const selectedPlayer = this.data.playerNames[index]

    this.setData({
      currentPlayer: selectedPlayer,
      playerPickerIndex: index
    })

    this.resetData()
    this.loadAllHistory()
  },

  // 清除所有筛选
  showAll() {
    this.setData({
      currentDate: '',
      pickerIndex: -1,
      currentPlayer: '',
      playerPickerIndex: -1
    })
    this.resetData()
    this.loadAllHistory()
  },

  // 单独清除日期筛选
  clearDateFilter() {
    this.setData({
      currentDate: '',
      pickerIndex: -1
    })
    this.resetData()
    this.loadAllHistory()
  },

  // 单独清除人名筛选
  clearPlayerFilter() {
    this.setData({
      currentPlayer: '',
      playerPickerIndex: -1
    })
    this.resetData()
    this.loadAllHistory()
  },

  resetData() {
    this.setData({
      groupedList: [],
      rawMatches: []
    })
  },

  // 删除比赛记录
  onDeleteMatch(e) {
    const matchId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条比赛记录吗？删除后将重新计算当日积分。',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          this.deleteMatch(matchId)
        }
      }
    })
  },

  async deleteMatch(id) {
    showLoading('回滚战绩中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'deleteMatch',
        data: { matchId: id }
      })

      hideLoading()
      
      if (res.result && res.result.success) {
        wx.showToast({ title: '已删除并回滚', icon: 'success' })
        clearCache('filterOptions')  // 清除缓存
        this.loadFilterOptions(true)  // 强制刷新筛选选项
        this.resetData()
        this.loadAllHistory()
      } else {
        console.error('删除逻辑报错', res)
        showError('操作失败，请重试')
      }
    } catch (err) {
      console.error('云函数调用失败', err)
      hideLoading()
      showError('网络异常')
    }
  },

  // 一次性加载所有历史记录
  async loadAllHistory() {
    if (this.data.isLoading) return

    this.setData({ isLoading: true })
    showLoading('加载中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'getMatchStats',
        data: {
          type: 'getHistoryMatches',
          filterDate: this.data.currentDate,
          filterPlayer: this.data.currentPlayer,
          page: 0,
          pageSize: 1000  // 一次性加载最多1000条
        }
      })

      hideLoading()

      if (res.result.success) {
        const matches = res.result.matches
        const groups = this.processGroups(matches)

        this.setData({
          rawMatches: matches,
          groupedList: groups,
          isLoading: false
        })

        console.log(`加载完成, 共 ${matches.length} 条记录`)
      } else {
        showError('加载失败')
        this.setData({ isLoading: false })
      }
    } catch (err) {
      console.error('加载历史失败', err)
      hideLoading()
      showError('加载失败')
      this.setData({ isLoading: false })
    }
  },

  // 处理分组和积分计算
  processGroups(matches) {
    const groupsMap = {}

    matches.forEach(match => {
      const dateObj = new Date(match.createTime)
      const dateStr = formatDate(dateObj)
      const timeStr = formatTime(dateObj)

      const scoreA = parseInt(match.scoreA) || 0
      const scoreB = parseInt(match.scoreB) || 0

      let winnerScore, loserScore
      if (match.winner === 'A') {
        winnerScore = scoreA
        loserScore = scoreB
      } else {
        winnerScore = scoreB
        loserScore = scoreA
      }

      const { points, tag } = calculateMatchPoints(winnerScore, loserScore)

      if (!groupsMap[dateStr]) {
        groupsMap[dateStr] = {
          date: dateStr,
          matches: [],
          statsObj: {}
        }
      }

      // 统计队伍A积分
      match.teamA.forEach(p => {
        const name = p.name
        const delta = match.winner === 'A' ? points : -points
        if (!groupsMap[dateStr].statsObj[name]) groupsMap[dateStr].statsObj[name] = 0
        groupsMap[dateStr].statsObj[name] += delta
      })

      // 统计队伍B积分
      match.teamB.forEach(p => {
        const name = p.name
        const delta = match.winner === 'B' ? points : -points
        if (!groupsMap[dateStr].statsObj[name]) groupsMap[dateStr].statsObj[name] = 0
        groupsMap[dateStr].statsObj[name] += delta
      })

      groupsMap[dateStr].matches.push({
        _id: match._id,
        time: timeStr,
        teamA: match.teamA.map(p => p.name).join(','),
        teamB: match.teamB.map(p => p.name).join(','),
        scoreStr: `${scoreA} : ${scoreB}`,
        winner: match.winner,
        points: points,
        tag: tag,
        isAWin: match.winner === 'A'
      })
    })

    const sortedDates = Object.keys(groupsMap).sort((a, b) => new Date(b) - new Date(a))

    return sortedDates.map(dateKey => {
      const group = groupsMap[dateKey]
      const statsArray = Object.keys(group.statsObj).map(name => ({
        name: name,
        score: group.statsObj[name]
      }))
      statsArray.sort((a, b) => b.score - a.score)

      return {
        date: group.date,
        matches: group.matches,
        dailyStats: statsArray
      }
    })
  }
})
