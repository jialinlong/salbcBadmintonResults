// pages/history/history.js
// 支持分页加载的历史记录页面 + 缓存优化

const { formatDate, formatTime, showLoading, hideLoading, showError, calculateMatchPoints } = require('../../utils/common')
const { getCache, setCache, clearCache } = require('../../utils/cache')
const { createTraceId, perfLog } = require('../../utils/perf')
const { createSingleFlight } = require('../../utils/singleFlight')

const DAYS_PER_PAGE = 3  // 每页加载的自然日数量（整天加载，保证当日结算准确）

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

    // 分页状态（按「天」分页）
    dayPage: 0,        // 下一次要加载的天页码
    hasMore: true,     // 是否还有更多数据
    isEnd: false,      // 是否已加载完全部
    isFirstLoad: true, // 是否首屏加载（用于骨架屏）
    isLoading: false   // 是否正在加载
  },

  hasInitialized: false,
  filterOptionsFlight: null,

  getFilterOptionsFlight() {
    if (!this.filterOptionsFlight) {
      this.filterOptionsFlight = createSingleFlight(() => {
        perfLog('history', createTraceId('history'), 'client:refresh:deduplicated')
      })
    }
    return this.filterOptionsFlight
  },

  onLoad() {
    const traceId = createTraceId('history')
    perfLog('history', traceId, 'client:onLoad')
  },

  onShow() {
    const traceId = createTraceId('history')
    perfLog('history', traceId, 'client:onShow')
    const app = getApp()
    const needsRefresh = app.globalData.needRefreshHistory
    const firstShow = !this.hasInitialized
    this.hasInitialized = true

    if (needsRefresh) {
      app.globalData.needRefreshHistory = false
      this.resetData()
    }

    if (firstShow || needsRefresh) {
      this.loadFilterOptions(needsRefresh)
    }

    if (needsRefresh || this.data.groupedList.length === 0) {
      this.loadHistory()
    }
  },

  onPullDownRefresh() {
    this.resetData()
    Promise.all([
      this.loadFilterOptions(true),
      this.loadHistory()
    ]).finally(() => wx.stopPullDownRefresh())
  },

  // 使用云函数一次性获取筛选选项 + 缓存
  async loadFilterOptions(forceRefresh = false) {
    const traceId = createTraceId('history')
    // 强制刷新时跳过缓存
    if (!forceRefresh) {
      const cachedOptions = getCache('filterOptions')
      if (cachedOptions) {
        perfLog('history', traceId, 'client:filterOptions:cache-hit', {
          dateCount: (cachedOptions.dates || []).length,
          playerCount: (cachedOptions.players || []).length
        })
        console.log('✅ 从缓存加载筛选选项')
        this.setData({
          pickerDates: cachedOptions.dates,
          playerNames: cachedOptions.players
        })
        return
      }
    }

    return this.getFilterOptionsFlight().run(async () => {
      const requestStart = Date.now()
      perfLog('history', traceId, 'client:cloud:getFilterOptions:start')
      try {
        const res = await wx.cloud.callFunction({
          name: 'getMatchStats',
          data: { type: 'getFilterOptions', traceId }
        })

        perfLog('history', traceId, 'client:cloud:getFilterOptions:end', {
          durationMs: Date.now() - requestStart,
          dateCount: res.result && res.result.dates ? res.result.dates.length : 0,
          playerCount: res.result && res.result.players ? res.result.players.length : 0
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
        perfLog('history', traceId, 'client:cloud:getFilterOptions:error', {
          durationMs: Date.now() - requestStart,
          errorName: err && err.name
        })
        console.error('加载筛选选项失败', err)
      }
    })
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
    this.loadHistory()
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
    this.loadHistory()
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
    this.loadHistory()
  },

  // 单独清除日期筛选
  clearDateFilter() {
    this.setData({
      currentDate: '',
      pickerIndex: -1
    })
    this.resetData()
    this.loadHistory()
  },

  // 单独清除人名筛选
  clearPlayerFilter() {
    this.setData({
      currentPlayer: '',
      playerPickerIndex: -1
    })
    this.resetData()
    this.loadHistory()
  },

  // 重置分页与列表状态（切换筛选 / 刷新前调用）
  resetData() {
    this.setData({
      groupedList: [],
      rawMatches: [],
      dayPage: 0,
      hasMore: true,
      isEnd: false,
      isFirstLoad: true
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
        this.loadHistory()
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

  // 滚动到底部，加载下一页
  onReachBottom() {
    if (this.data.isLoading || !this.data.hasMore) return
    this.loadHistory()
  },

  // 按「天」分页加载历史记录（每页若干个完整自然日，追加到已有数据）
  async loadHistory() {
    if (this.data.isLoading || !this.data.hasMore) return

    const traceId = createTraceId('history')
    const isFirstLoad = this.data.isFirstLoad
    const currentDayPage = this.data.dayPage

    this.setData({ isLoading: true })

    // 仅首屏使用 loading 提示，加载更多时由底部 footer 提示
    if (isFirstLoad) showLoading('加载中...')

    const requestStart = Date.now()
    perfLog('history', traceId, 'client:cloud:getHistoryDays:start', {
      dayPage: currentDayPage,
      daysPerPage: DAYS_PER_PAGE
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getMatchStats',
        data: {
          type: 'getHistoryDays',
          filterDate: this.data.currentDate,
          filterPlayer: this.data.currentPlayer,
          dayPage: currentDayPage,
          daysPerPage: DAYS_PER_PAGE,
          traceId
        }
      })

      perfLog('history', traceId, 'client:cloud:getHistoryDays:end', {
        durationMs: Date.now() - requestStart,
        dayCount: res.result && res.result.days ? res.result.days.length : 0,
        matchCount: res.result && res.result.matches ? res.result.matches.length : 0
      })

      if (isFirstLoad) hideLoading()

      if (res.result.success) {
        const newMatches = res.result.matches || []
        // 追加到累积数据，保持 createTime 倒序（整天加载，不会跨页拆分某一天）
        const rawMatches = this.data.rawMatches.concat(newMatches)
        const processStart = Date.now()
        const groups = this.processGroups(rawMatches)
        perfLog('history', traceId, 'client:processGroups:end', {
          durationMs: Date.now() - processStart,
          matchCount: rawMatches.length,
          groupCount: groups.length
        })
        const hasMore = res.result.hasMore
        const renderStart = Date.now()

        this.setData({
          rawMatches,
          groupedList: groups,
          dayPage: currentDayPage + 1,
          hasMore,
          isEnd: !hasMore,
          isFirstLoad: false,
          isLoading: false
        }, () => {
          perfLog('history', traceId, 'client:render:end', {
            durationMs: Date.now() - renderStart,
            matchCount: rawMatches.length,
            groupCount: groups.length
          })
        })

        console.log(`第 ${currentDayPage + 1} 天页加载完成, 本页 ${(res.result.days || []).length} 天 / ${newMatches.length} 条, 累计 ${rawMatches.length} 条`)
      } else {
        showError('加载失败')
        this.setData({ isLoading: false, isFirstLoad: false })
      }
    } catch (err) {
      perfLog('history', traceId, 'client:cloud:getHistoryDays:error', {
        durationMs: Date.now() - requestStart,
        errorName: err && err.name
      })
      console.error('加载历史失败', err)
      if (isFirstLoad) hideLoading()
      showError('加载失败')
      this.setData({ isLoading: false, isFirstLoad: false })
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
