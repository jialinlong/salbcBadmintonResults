// pages/addPlayer/index.js
// 优化版本：使用云函数验证密码，统一工具函数

const { showLoading, hideLoading, showSuccess, showError } = require('../../utils/common')
const { clearCache } = require('../../utils/cache')

const db = wx.cloud.database()
const playersCollection = db.collection('players')

Page({
  data: {
    playerName: '',
    
    // 权限相关
    hasPermission: false,
    showPasswordModal: false,
    inputPassword: ''
  },

  onLoad() {
    this.checkPermission()
  },

  onShow() {
    this.checkPermission()
  },

  // 检查权限
  checkPermission() {
    const permission = wx.getStorageSync('player_permission')
    
    if (permission === 'granted') {
      this.setData({ hasPermission: true })
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
      return showError('请输入密码')
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
        wx.setStorageSync('player_permission', 'granted')
        
        this.setData({
          hasPermission: true,
          showPasswordModal: false,
          inputPassword: ''
        })
        
        showSuccess('验证成功')
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
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/rank/rank' })
      }
    })
  },

  stopPropagation() {},

  // 监听输入框变化
  onNameInput(event) {
    this.setData({
      playerName: event.detail.value
    })
  },

  // 添加球员
  async addPlayer() {
    if (!this.data.hasPermission) {
      return showError('请先验证密码')
    }

    const name = this.data.playerName.trim()

    if (!name) {
      return showError('名字不能为空')
    }

    showLoading('正在校验...')

    try {
      // 查询是否有重名
      const res = await playersCollection.where({ name }).count()
      
      if (res.total > 0) {
        hideLoading()
        return showError('该名字已存在')
      }

      // 执行添加
      await this.doAddPlayer(name)
    } catch (err) {
      hideLoading()
      console.error('查询失败:', err)
      showError('查询失败')
    }
  },

  // 实际添加逻辑
  async doAddPlayer(name) {
    showLoading('正在添加...')

    try {
      await playersCollection.add({
        data: {
          name: name,
          total_matches: 0,
          wins: 0,
          losses: 0,
          createTime: db.serverDate()
        }
      })

      clearCache('matchPlayers')
      hideLoading()
      showSuccess('添加成功')
      this.setData({ playerName: '' })
    } catch (err) {
      hideLoading()
      console.error('添加失败:', err)
      showError('添加失败')
    }
  },

  // 清除权限（开发调试用）
  clearPermission() {
    wx.removeStorageSync('player_permission')
    showSuccess('权限已清除')
    setTimeout(() => this.checkPermission(), 1000)
  }
})
