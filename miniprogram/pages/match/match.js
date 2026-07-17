// pages/match/match.js
// 优化版本：使用云函数验证密码，统一工具函数

const { toPinyin } = require('../../utils/pinyin')
const { showLoading, hideLoading, showSuccess, showError } = require('../../utils/common')
const { createTraceId, perfLog } = require('../../utils/perf')
const { getCache, setCache } = require('../../utils/cache')
const { normalizePlayers } = require('../../utils/playerData')
const { createSingleFlight } = require('../../utils/singleFlight')

Page({
  data: {
    selectedPlayers: [null, null, null, null],
    scoreA: '',
    scoreB: '',
    
    showPlayerModal: false,
    currentPickerIndex: 0,
    searchKeyword: '',
    filteredPlayers: [],
    currentSelectedId: '',
    
    // 搭档推荐
    recommendedPartners: [],
    
    // 权限相关
    hasPermission: false,
    showPasswordModal: false,
    inputPassword: ''
  },

  activeNamesSet: new Set(),
  partnerHistory: {},  // 搭档历史记录
  allPlayers: [],
  playersFlight: null,

  onLoad() {
    this.playersFlight = createSingleFlight(() => {
      perfLog('match', this.pageTraceId || createTraceId('match'), 'client:refresh:deduplicated')
    })
  },

  getPlayersFlight() {
    if (!this.playersFlight) this.onLoad()
    return this.playersFlight
  },

  onShow() {
    const traceId = createTraceId('match')
    this.pageTraceId = traceId
    perfLog('match', traceId, 'client:onShow')
    console.log('🔄 页面显示')
    this.checkPermission(traceId)
  },

  // 检查权限
  checkPermission(traceId = this.pageTraceId || createTraceId('match')) {
    const permission = wx.getStorageSync('match_permission')
    const granted = permission === 'granted'
    perfLog('match', traceId, 'client:permission:end', { granted })
    
    if (granted) {
      this.setData({ hasPermission: true })
      this.fetchPlayers()
    } else {
      this.setData({ 
        hasPermission: false,
        showPasswordModal: true 
      })
    }
  },

  // 密码输入
  onPasswordInput(e) {
    this.setData({ inputPassword: e.detail.value })
  },

  // 使用云函数验证密码
  async verifyPassword() {
    const { inputPassword } = this.data

    if (!inputPassword) {
      showError('请输入密码')
      return
    }

    showLoading('验证中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'verifyPassword',
        data: {
          password: inputPassword,
          type: 'match'
        }
      })

      hideLoading()

      if (res.result.success) {
        wx.setStorageSync('match_permission', 'granted')
        wx.setStorageSync('match_permission_time', Date.now())
        
        this.setData({
          hasPermission: true,
          showPasswordModal: false,
          inputPassword: ''
        })
        
        showSuccess('验证成功')
        this.fetchPlayers()
      } else {
        showError('密码错误')
        this.setData({ inputPassword: '' })
      }
    } catch (err) {
      hideLoading()
      console.error('验证失败:', err)
      showError('验证失败')
    }
  },

  // 关闭密码弹窗时返回上一页
  closePasswordModal() {
    wx.navigateBack()
  },

  onPullDownRefresh() {
    this.fetchPlayers({ forceRefresh: true }).finally(() => wx.stopPullDownRefresh())
  },

  async fetchPlayers(options = {}) {
    if (!this.data.hasPermission) return

    const { forceRefresh = false, showSpinner = true } = options
    const traceId = createTraceId('match')
    const cached = forceRefresh ? null : getCache('matchPlayers')
    const hasCachedData = Boolean(cached && cached.players && cached.todayMatches)
    const hasExistingData = hasCachedData || this.allPlayers.length > 0

    if (hasCachedData) {
      this.applyPlayersData(cached.players, cached.todayMatches, traceId, 'cache')
      perfLog('match', traceId, 'client:cache-hit', {
        ageMs: cached.cachedAt ? Date.now() - cached.cachedAt : undefined,
        playerCount: cached.players.length,
        todayMatchCount: cached.todayMatches.length
      })
    }

    const blocking = !hasExistingData && showSpinner
    if (blocking) showLoading('加载中...')

    const request = this.getPlayersFlight().run(async () => {
      const requestStart = Date.now()
      perfLog('match', traceId, 'client:cloud:getAllPlayers:start')

      try {
        const res = await wx.cloud.callFunction({
          name: 'getAllPlayers',
          data: { traceId }
        })

        if (!res.result.success) {
          throw new Error(res.result.errMsg || '获取数据失败')
        }

        const players = res.result.players
        const todayMatches = res.result.todayMatches
        perfLog('match', traceId, 'client:cloud:getAllPlayers:end', {
          durationMs: Date.now() - requestStart,
          playerCount: players.length,
          todayMatchCount: todayMatches.length
        })

        setCache('matchPlayers', { players, todayMatches, cachedAt: Date.now() })
        this.applyPlayersData(players, todayMatches, traceId, 'cloud')
      } catch (err) {
        perfLog('match', traceId, 'client:cloud:getAllPlayers:error', {
          durationMs: Date.now() - requestStart,
          errorName: err && err.name
        })
        console.error('❌ 加载球员失败', err)
        showError(hasExistingData ? '刷新失败，已保留现有数据' : '加载失败，请重试')
      }
    })
    return request.finally(() => {
      if (blocking) hideLoading()
    })
  },

  applyPlayersData(players, todayMatches, traceId = createTraceId('match'), source = 'cloud') {
    const normalizeStart = Date.now()
    this.activeNamesSet.clear()
    const recentMatches = todayMatches || []
    recentMatches.forEach(match => {
      const teamA = match.teamA || []
      const teamB = match.teamB || []
      teamA.forEach(player => this.activeNamesSet.add(player.name))
      teamB.forEach(player => this.activeNamesSet.add(player.name))
    })

    this.allPlayers = normalizePlayers(players, this.activeNamesSet, toPinyin)
    perfLog('match', traceId, 'client:normalizePlayers:end', {
      durationMs: Date.now() - normalizeStart,
      playerCount: this.allPlayers.length,
      source
    })

    if (this.data.showPlayerModal) {
      const setDataStart = Date.now()
      const filteredPlayers = this.getAvailablePlayers(this.data.currentPickerIndex)
      this.setData({ filteredPlayers }, () => {
        perfLog('match', traceId, 'client:setData:end', {
          durationMs: Date.now() - setDataStart,
          playerCount: filteredPlayers.length,
          source
        })
      })
    }
  },

  openPlayerPicker(e) {
    const index = e.currentTarget.dataset.index
    const currentPlayer = this.data.selectedPlayers[index]
    const availablePlayers = this.getAvailablePlayers(index)
    
    this.setData({
      showPlayerModal: true,
      currentPickerIndex: index,
      searchKeyword: '',
      filteredPlayers: availablePlayers,
      currentSelectedId: currentPlayer ? currentPlayer._id : ''
    })
  },

  getAvailablePlayers(currentIndex) {
    const { selectedPlayers } = this.data
    
    const selectedIds = selectedPlayers
      .map((p, idx) => idx === currentIndex ? null : (p ? p._id : null))
      .filter(id => id !== null)

    return this.allPlayers.filter(player => !selectedIds.includes(player._id))
  },

  onSearchInput(e) {
    const keyword = e.detail.value.trim().toLowerCase()
    const availablePlayers = this.getAvailablePlayers(this.data.currentPickerIndex)

    let filtered = availablePlayers
    if (keyword) {
      filtered = availablePlayers.filter(p => {
        return p.name.toLowerCase().includes(keyword) ||
               p.fullPinyin.includes(keyword) ||
               p.firstLetters.includes(keyword)
      })
    }

    this.setData({
      searchKeyword: keyword,
      filteredPlayers: filtered
    })
  },

  selectPlayerDirectly(e) {
    const player = e.currentTarget.dataset.player
    const { currentPickerIndex, selectedPlayers } = this.data

    const newSelectedPlayers = [...selectedPlayers]
    newSelectedPlayers[currentPickerIndex] = player

    this.setData({
      selectedPlayers: newSelectedPlayers,
      showPlayerModal: false,
      searchKeyword: '',
      currentSelectedId: ''
    })

    // 如果选择的是队伍第一人(A1或B1)，更新搭档推荐
    if (currentPickerIndex === 0 || currentPickerIndex === 2) {
      this.updatePartnerRecommendations(player.name)
    }
  },

  closePlayerPicker() {
    this.setData({
      showPlayerModal: false,
      searchKeyword: '',
      currentSelectedId: ''
    })
  },

  stopPropagation() {},

  onScoreAInput(e) {
    this.setData({ scoreA: e.detail.value })
  },

  onScoreBInput(e) {
    this.setData({ scoreB: e.detail.value })
  },

  // 快捷比分设置
  setQuickScore(e) {
    const { a, b } = e.currentTarget.dataset
    this.setData({
      scoreA: String(a),
      scoreB: String(b)
    })
  },

  // 更新搭档推荐（当选择第一个队员后）
  updatePartnerRecommendations(playerName) {
    if (!playerName || !this.partnerHistory[playerName]) {
      this.setData({ recommendedPartners: [] })
      return
    }
    
    const partners = this.partnerHistory[playerName]
    // 按合作次数排序，取前3个
    const sorted = Object.entries(partners)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    
    this.setData({ recommendedPartners: sorted })
  },

  // 快速选择推荐搭档
  selectRecommendedPartner(e) {
    const partnerName = e.currentTarget.dataset.name
    const { selectedPlayers } = this.data
    
    const partner = this.allPlayers.find(p => p.name === partnerName)
    if (partner) {
      // 确定要填充的位置：A1选了填A2，B1选了填B2
      let targetIndex
      if (selectedPlayers[0] && !selectedPlayers[1]) {
        targetIndex = 1  // A2位置
      } else if (selectedPlayers[2] && !selectedPlayers[3]) {
        targetIndex = 3  // B2位置
      } else {
        return
      }
      
      const newSelectedPlayers = [...selectedPlayers]
      newSelectedPlayers[targetIndex] = partner
      
      this.setData({ 
        selectedPlayers: newSelectedPlayers,
        recommendedPartners: []
      })
    }
  },

  async submitMatch() {
    const { selectedPlayers, scoreA, scoreB } = this.data

    if (selectedPlayers.some(p => p === null)) {
      return showError('请选齐4名选手')
    }
    if (!scoreA || !scoreB) {
      return showError('请填写比分')
    }

    showLoading('记录中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'recordMatch',
        data: {
          teamA: [selectedPlayers[0], selectedPlayers[1]],
          teamB: [selectedPlayers[2], selectedPlayers[3]],
          scoreA: parseInt(scoreA),
          scoreB: parseInt(scoreB)
        }
      })

      hideLoading()
      
      if (res.result.success) {
        showSuccess('记录成功')

        // 更新活跃状态
        selectedPlayers.forEach(p => {
          if (p) this.activeNamesSet.add(p.name)
        })

        // 更新搭档历史
        this.updatePartnerHistory(selectedPlayers)

        // 清除缓存并设置刷新标记
        const { clearCache } = require('../../utils/cache')
        clearCache('filterOptions')
        const app = getApp()
        app.globalData.needRefreshHistory = true

        // 询问是否保留队员
        this.showKeepPlayersDialog()

        this.fetchPlayers({ forceRefresh: true, showSpinner: false })
      } else {
        showError('系统错误')
      }
    } catch (err) {
      hideLoading()
      console.error('提交失败:', err)
      showError('网络异常')
    }
  },

  // 更新搭档历史记录
  updatePartnerHistory(players) {
    // A队搭档
    if (players[0] && players[1]) {
      const name0 = players[0].name
      const name1 = players[1].name
      if (!this.partnerHistory[name0]) this.partnerHistory[name0] = {}
      if (!this.partnerHistory[name1]) this.partnerHistory[name1] = {}
      this.partnerHistory[name0][name1] = (this.partnerHistory[name0][name1] || 0) + 1
      this.partnerHistory[name1][name0] = (this.partnerHistory[name1][name0] || 0) + 1
    }
    // B队搭档
    if (players[2] && players[3]) {
      const name2 = players[2].name
      const name3 = players[3].name
      if (!this.partnerHistory[name2]) this.partnerHistory[name2] = {}
      if (!this.partnerHistory[name3]) this.partnerHistory[name3] = {}
      this.partnerHistory[name2][name3] = (this.partnerHistory[name2][name3] || 0) + 1
      this.partnerHistory[name3][name2] = (this.partnerHistory[name3][name2] || 0) + 1
    }
  },

  // 显示保留队员对话框
  showKeepPlayersDialog() {
    wx.showActionSheet({
      itemList: ['保留全部队员', '保留A队', '保留B队', '清空全部'],
      success: (res) => {
        const { selectedPlayers } = this.data
        let newPlayers = [null, null, null, null]
        
        if (res.tapIndex === 0) {
          // 保留全部
          newPlayers = [...selectedPlayers]
        } else if (res.tapIndex === 1) {
          // 保留A队
          newPlayers = [selectedPlayers[0], selectedPlayers[1], null, null]
        } else if (res.tapIndex === 2) {
          // 保留B队
          newPlayers = [null, null, selectedPlayers[2], selectedPlayers[3]]
        }
        // tapIndex === 3 清空全部，保持 [null, null, null, null]
        
        this.setData({
          selectedPlayers: newPlayers,
          scoreA: '',
          scoreB: ''
        })
      },
      fail: () => {
        // 用户取消，默认清空
        this.setData({
          selectedPlayers: [null, null, null, null],
          scoreA: '',
          scoreB: ''
        })
      }
    })
  }
})
