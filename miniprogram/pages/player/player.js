// pages/player/player.js
// 个人详情页 - 展示个人战绩、搭档分析、对手克星

const { showLoading, hideLoading, showSuccess, showError } = require('../../utils/common')

Page({
  data: {
    playerName: '',
    avatar: '',  // 玩家头像URL
    
    // 基础统计
    totalMatches: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    netScore: 0,
    
    // 连胜记录
    currentStreak: 0,
    maxStreak: 0,
    streakType: '',
    
    // 搭档分析
    bestPartners: [],
    
    // 对手克星
    bestAgainst: [],
    
    // 苦手
    worstAgainst: [],
    
    // 最近比赛
    recentMatches: [],
    
    // 扩展统计
    firstMatchDate: '',
    activeDays: 0,
    monthMatches: 0,
    monthWins: 0,
    recentWinRate: 0,
    biggestWin: 0,
    totalPartners: 0,
    totalScore: 0,
    
    // 新增：本月对比
    lastMonthMatches: 0,
    lastMonthWins: 0,
    lastMonthWinRate: 0,
    monthWinRate: 0,
    
    // 新增：胜率趋势
    winRateTrend: [],
    
    // 新增：成就系统
    achievements: [],
    nextAchievements: [],
    
    // 新增：个人记录
    records: {},
    
    // 新增：活跃日历
    calendarData: [],
    firstDayOffset: 0,  // 本月1号是星期几(0-6)
    
    // 新增：黄金搭档
    goldenPartner: null,
    singleDayMax: 0,
    
    isLoading: true,
    
    // 分享卡片
    showShareModal: false,
    shareImagePath: ''
  },

  onLoad(options) {
    if (options.name) {
      const name = decodeURIComponent(options.name)
      this.setData({ playerName: name })
      wx.setNavigationBarTitle({ title: name + ' 的战绩' })
      this.loadPlayerStats(name)
    }
  },

  async loadPlayerStats(name) {
    this.setData({ isLoading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'getPlayerStats',
        data: { playerName: name }
      })

      if (res.result.success) {
        const data = res.result.data
        // 计算本月胜率
        const monthWinRate = data.monthMatches > 0 
          ? Math.round((data.monthWins / data.monthMatches) * 100) 
          : 0
        
        // 计算本月1号是星期几 (用于日历对齐)
        const now = new Date()
        const firstDayOffset = new Date(now.getFullYear(), now.getMonth(), 1).getDay()
        
        // 处理头像：云存储 fileID 需要转换为临时链接
        let avatar = data.avatar || ''
        if (avatar && avatar.startsWith('cloud://')) {
          try {
            const tempRes = await wx.cloud.getTempFileURL({ fileList: [avatar] })
            if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
              avatar = tempRes.fileList[0].tempFileURL
            } else {
              // 转换失败，使用默认头像
              avatar = ''
            }
          } catch (e) {
            console.log('头像链接转换失败:', e)
            avatar = ''  // 转换失败使用默认头像
          }
        }
        
        this.setData({
          ...data,
          avatar,
          monthWinRate,
          firstDayOffset,
          isLoading: false
        })
      } else {
        showError('加载失败')
        this.setData({ isLoading: false })
      }
    } catch (err) {
      console.error('加载个人数据失败:', err)
      showError('加载失败')
      this.setData({ isLoading: false })
    }
  },

  // 点击头像 - 显示更换选项
  onAvatarTap() {
    wx.showActionSheet({
      itemList: ['使用微信头像', '从相册选择', '恢复默认'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.useWechatAvatar()
        } else if (res.tapIndex === 1) {
          this.chooseFromAlbum()
        } else if (res.tapIndex === 2) {
          this.resetAvatar()
        }
      }
    })
  },

  // 使用微信头像
  useWechatAvatar() {
    wx.getUserProfile({
      desc: '用于设置个人头像',
      success: (res) => {
        const avatarUrl = res.userInfo.avatarUrl
        this.updateAvatar(avatarUrl)
      },
      fail: () => {
        showError('获取头像失败')
      }
    })
  },

  // 从相册选择
  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        showLoading('上传中...')
        
        try {
          // 上传到云存储
          const cloudPath = `avatars/${this.data.playerName}_${Date.now()}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath
          })
          
          hideLoading()
          this.updateAvatar(uploadRes.fileID)
        } catch (err) {
          hideLoading()
          console.error('上传头像失败:', err)
          showError('上传失败')
        }
      }
    })
  },

  // 恢复默认头像
  resetAvatar() {
    this.updateAvatar('')
  },

  // 更新头像到数据库
  async updateAvatar(avatarUrl) {
    showLoading('保存中...')
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'updatePlayerAvatar',
        data: {
          playerName: this.data.playerName,
          avatarUrl
        }
      })
      
      hideLoading()
      
      if (res.result.success) {
        // 如果是云存储 fileID，转换为临时链接
        let displayAvatar = avatarUrl
        if (avatarUrl && avatarUrl.startsWith('cloud://')) {
          try {
            const tempRes = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] })
            if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
              displayAvatar = tempRes.fileList[0].tempFileURL
            } else {
              displayAvatar = ''
            }
          } catch (e) {
            console.log('头像链接转换失败:', e)
            displayAvatar = ''
          }
        }
        this.setData({ avatar: displayAvatar })
        showSuccess('头像已更新')
      } else {
        showError('更新失败')
      }
    } catch (err) {
      hideLoading()
      console.error('更新头像失败:', err)
      showError('更新失败')
    }
  },

  // 生成分享卡片
  async generateShareCard() {
    showLoading('生成卡片中...')

    try {
      const query = wx.createSelectorQuery()
      query.select('#shareCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          if (!res[0]) {
            hideLoading()
            showError('生成失败')
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio
          
          canvas.width = 600 * dpr
          canvas.height = 800 * dpr
          ctx.scale(dpr, dpr)

          // 如果有头像，加载图片对象
          let avatarImage = null
          if (this.data.avatar) {
            try {
              avatarImage = await this.loadCanvasImage(canvas, this.data.avatar)
            } catch (e) {
              console.log('头像加载失败，使用默认')
            }
          }

          this.drawShareCard(ctx, canvas, avatarImage)
        })
    } catch (err) {
      hideLoading()
      console.error('生成卡片失败:', err)
      showError('生成失败')
    }
  },

  // 加载图片到Canvas Image对象
  loadCanvasImage(canvas, src) {
    return new Promise(async (resolve, reject) => {
      try {
        let imageUrl = src
        
        // 如果是云存储fileID，先获取临时链接
        if (src.startsWith('cloud://')) {
          const res = await wx.cloud.getTempFileURL({ fileList: [src] })
          imageUrl = res.fileList[0].tempFileURL
        }
        
        // 下载图片获取本地路径
        const imgInfo = await new Promise((res, rej) => {
          wx.getImageInfo({
            src: imageUrl,
            success: res,
            fail: rej
          })
        })
        
        // 创建canvas图片对象
        const img = canvas.createImage()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = imgInfo.path
      } catch (err) {
        reject(err)
      }
    })
  },

  // 绘制卡片内容
  drawShareCard(ctx, canvas, avatarImage) {
    const { 
      playerName, totalMatches, wins, losses, winRate, netScore, maxStreak, 
      currentStreak, streakType, bestPartners, bestAgainst,
      firstMatchDate, activeDays, monthMatches, monthWins, recentWinRate, biggestWin, totalPartners
    } = this.data
    const width = 600
    const height = 800
    
    // 使用系统中文字体
    const fontFamily = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", STHeiti, "Microsoft Yahei", Tahoma, Simsun'

    // ========== 背景 ==========
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
    bgGradient.addColorStop(0, '#667eea')
    bgGradient.addColorStop(0.5, '#764ba2')
    bgGradient.addColorStop(1, '#f093fb')
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    // 装饰元素
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.beginPath()
    ctx.arc(-30, 120, 180, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(630, 80, 150, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(580, 780, 220, 0, Math.PI * 2)
    ctx.fill()

    // ========== 顶部区域 ==========
    // 头像外圈
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(300, 85, 48, 0, Math.PI * 2)
    ctx.stroke()

    // 绘制头像
    if (avatarImage) {
      // 有图片头像 - 裁剪为圆形
      ctx.save()
      ctx.beginPath()
      ctx.arc(300, 85, 42, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(avatarImage, 258, 43, 84, 84)
      ctx.restore()
    } else {
      // 默认文字头像
      const avatarGradient = ctx.createLinearGradient(260, 45, 340, 125)
      avatarGradient.addColorStop(0, 'rgba(255,255,255,0.35)')
      avatarGradient.addColorStop(1, 'rgba(255,255,255,0.15)')
      ctx.fillStyle = avatarGradient
      ctx.beginPath()
      ctx.arc(300, 85, 42, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.font = `bold 36px ${fontFamily}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(playerName[0] || '?', 300, 85)
    }

    // 重置文本对齐
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'

    // 玩家名字
    ctx.font = `bold 32px ${fontFamily}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(playerName, 300, 165)

    // 连胜/连败徽章
    let badgeEndY = 175
    if (currentStreak >= 3) {
      const badgeText = streakType === 'win' ? `${currentStreak} 连胜中` : `${currentStreak} 连败中`
      const badgeColor = streakType === 'win' ? '#ff6b6b' : '#54a0ff'
      ctx.fillStyle = badgeColor
      this.roundRect(ctx, 230, 180, 140, 28, 14)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `bold 16px ${fontFamily}`
      ctx.fillText(badgeText, 300, 200)
      badgeEndY = 220
    }

    // 副标题
    ctx.font = `16px ${fontFamily}`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('SALBC俱乐部羽毛球战绩', 300, badgeEndY + 10)

    // ========== 主数据卡片 ==========
    const cardY = badgeEndY + 30
    ctx.fillStyle = '#fff'
    this.roundRect(ctx, 25, cardY, 550, 500, 20)
    ctx.fill()

    // === 核心数据区 (第一行) ===
    const row1Y = cardY + 60
    
    // 总场次
    ctx.fillStyle = '#667eea'
    ctx.font = `bold 44px ${fontFamily}`
    ctx.fillText(totalMatches.toString(), 110, row1Y)
    ctx.fillStyle = '#999'
    ctx.font = `13px ${fontFamily}`
    ctx.fillText('总场次', 110, row1Y + 24)

    // 胜率(核心高亮)
    ctx.fillStyle = '#ff6b6b'
    ctx.font = `bold 52px ${fontFamily}`
    ctx.fillText(winRate + '%', 300, row1Y)
    ctx.fillStyle = '#999'
    ctx.font = `13px ${fontFamily}`
    ctx.fillText('胜率', 300, row1Y + 24)

    // 胜/负
    ctx.font = `bold 44px ${fontFamily}`
    ctx.fillStyle = '#52c41a'
    ctx.fillText(wins.toString(), 460, row1Y)
    ctx.fillStyle = '#ccc'
    ctx.font = `bold 28px ${fontFamily}`
    ctx.fillText('/', 495, row1Y)
    ctx.fillStyle = '#aaa'
    ctx.font = `bold 44px ${fontFamily}`
    ctx.fillText(losses.toString(), 530, row1Y)
    ctx.fillStyle = '#999'
    ctx.font = `13px ${fontFamily}`
    ctx.fillText('胜 / 负', 495, row1Y + 24)

    // === 分割线 ===
    ctx.strokeStyle = '#f0f0f0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(50, cardY + 105)
    ctx.lineTo(550, cardY + 105)
    ctx.stroke()

    // === 详细数据区 (4个指标) ===
    const row2Y = cardY + 160
    const boxW = 120
    const boxH = 70
    const boxGap = 15
    const startX = 45

    // 指标1: 净胜分
    ctx.fillStyle = '#fef3f3'
    this.roundRect(ctx, startX, row2Y - 35, boxW, boxH, 10)
    ctx.fill()
    ctx.fillStyle = netScore >= 0 ? '#ff6b6b' : '#52c41a'
    ctx.font = `bold 28px ${fontFamily}`
    ctx.fillText((netScore >= 0 ? '+' : '') + netScore, startX + boxW/2, row2Y + 5)
    ctx.fillStyle = '#999'
    ctx.font = `12px ${fontFamily}`
    ctx.fillText('净胜分', startX + boxW/2, row2Y + 26)

    // 指标2: 最长连胜
    ctx.fillStyle = '#fffbf0'
    this.roundRect(ctx, startX + boxW + boxGap, row2Y - 35, boxW, boxH, 10)
    ctx.fill()
    ctx.fillStyle = '#faad14'
    ctx.font = `bold 28px ${fontFamily}`
    ctx.fillText(maxStreak.toString(), startX + boxW + boxGap + boxW/2, row2Y + 5)
    ctx.fillStyle = '#999'
    ctx.font = `12px ${fontFamily}`
    ctx.fillText('最长连胜', startX + boxW + boxGap + boxW/2, row2Y + 26)

    // 指标3: 最大分差
    ctx.fillStyle = '#f0f9ff'
    this.roundRect(ctx, startX + (boxW + boxGap) * 2, row2Y - 35, boxW, boxH, 10)
    ctx.fill()
    ctx.fillStyle = '#1890ff'
    ctx.font = `bold 28px ${fontFamily}`
    ctx.fillText(biggestWin.toString(), startX + (boxW + boxGap) * 2 + boxW/2, row2Y + 5)
    ctx.fillStyle = '#999'
    ctx.font = `12px ${fontFamily}`
    ctx.fillText('最大分差胜', startX + (boxW + boxGap) * 2 + boxW/2, row2Y + 26)

    // 指标4: 活跃天数
    ctx.fillStyle = '#f6ffed'
    this.roundRect(ctx, startX + (boxW + boxGap) * 3, row2Y - 35, boxW, boxH, 10)
    ctx.fill()
    ctx.fillStyle = '#52c41a'
    ctx.font = `bold 28px ${fontFamily}`
    ctx.fillText(activeDays.toString(), startX + (boxW + boxGap) * 3 + boxW/2, row2Y + 5)
    ctx.fillStyle = '#999'
    ctx.font = `12px ${fontFamily}`
    ctx.fillText('活跃天数', startX + (boxW + boxGap) * 3 + boxW/2, row2Y + 26)

    // === 本月战绩 & 近期状态 ===
    const row3Y = cardY + 270
    
    // 本月战绩块
    ctx.fillStyle = '#f8f9fa'
    this.roundRect(ctx, 45, row3Y - 20, 250, 65, 10)
    ctx.fill()
    
    ctx.fillStyle = '#667eea'
    ctx.font = `bold 13px ${fontFamily}`
    ctx.textAlign = 'left'
    ctx.fillText('本月战绩', 60, row3Y)
    
    const monthWinRate = monthMatches > 0 ? Math.round((monthWins / monthMatches) * 100) : 0
    ctx.fillStyle = '#333'
    ctx.font = `bold 24px ${fontFamily}`
    ctx.fillText(`${monthWins}胜${monthMatches - monthWins}负`, 60, row3Y + 30)
    
    ctx.textAlign = 'right'
    ctx.fillStyle = monthWinRate >= 50 ? '#ff6b6b' : '#999'
    ctx.font = `bold 22px ${fontFamily}`
    ctx.fillText(`${monthWinRate}%`, 280, row3Y + 30)

    // 近期状态块
    ctx.fillStyle = '#f8f9fa'
    this.roundRect(ctx, 305, row3Y - 20, 250, 65, 10)
    ctx.fill()
    
    ctx.fillStyle = '#f5222d'
    ctx.font = `bold 13px ${fontFamily}`
    ctx.textAlign = 'left'
    ctx.fillText('近10场状态', 320, row3Y)
    
    // 状态对比
    const trendUp = recentWinRate > winRate
    const trendIcon = trendUp ? '↑' : (recentWinRate < winRate ? '↓' : '→')
    const trendColor = trendUp ? '#52c41a' : (recentWinRate < winRate ? '#ff4d4f' : '#999')
    
    ctx.fillStyle = '#333'
    ctx.font = `bold 24px ${fontFamily}`
    ctx.fillText(`${recentWinRate}%`, 320, row3Y + 30)
    
    ctx.fillStyle = trendColor
    ctx.font = `bold 18px ${fontFamily}`
    ctx.fillText(trendIcon, 385, row3Y + 30)
    
    ctx.textAlign = 'right'
    ctx.fillStyle = '#999'
    ctx.font = `13px ${fontFamily}`
    ctx.fillText(`总胜率 ${winRate}%`, 540, row3Y + 30)

    // === 搭档信息 ===
    const row4Y = cardY + 370
    
    if (bestPartners.length > 0) {
      // 搭档卡片背景 (45-555, 宽510)
      ctx.fillStyle = '#f0f5ff'
      this.roundRect(ctx, 45, row4Y - 15, 510, 55, 10)
      ctx.fill()
      
      // 左侧：标签+名字 (居中于左半部分)
      const partnerLeftCenter = 45 + 170  // 左侧区域中心
      ctx.textAlign = 'center'
      ctx.fillStyle = '#667eea'
      ctx.font = `bold 13px ${fontFamily}`
      ctx.fillText('最佳搭档', partnerLeftCenter - 60, row4Y + 5)
      
      ctx.fillStyle = '#333'
      ctx.font = `bold 20px ${fontFamily}`
      ctx.fillText(bestPartners[0].name, partnerLeftCenter + 40, row4Y + 5)
      
      ctx.fillStyle = '#999'
      ctx.font = `14px ${fontFamily}`
      ctx.fillText(`合作${bestPartners[0].matches}场`, partnerLeftCenter, row4Y + 28)
      
      // 右侧：胜率 (居中于右半部分)
      const partnerRightCenter = 45 + 510 - 100
      ctx.fillStyle = '#ff6b6b'
      ctx.font = `bold 22px ${fontFamily}`
      ctx.fillText(`${bestPartners[0].winRate}%`, partnerRightCenter, row4Y + 12)
      ctx.fillStyle = '#999'
      ctx.font = `12px ${fontFamily}`
      ctx.fillText('胜率', partnerRightCenter, row4Y + 30)
    }

    // === 克星/社交数据 ===
    const row5Y = cardY + 445
    
    // 克星卡片 (45-295, 宽250)
    if (bestAgainst && bestAgainst.length > 0) {
      ctx.fillStyle = '#fff1f0'
      this.roundRect(ctx, 45, row5Y - 15, 250, 50, 10)
      ctx.fill()
      
      const enemyCenter = 45 + 125  // 卡片水平中心
      ctx.textAlign = 'center'
      
      // 上行：标签+名字+胜率
      ctx.fillStyle = '#f5222d'
      ctx.font = `bold 12px ${fontFamily}`
      ctx.fillText('克星对手', enemyCenter - 70, row5Y + 3)
      
      ctx.fillStyle = '#333'
      ctx.font = `bold 16px ${fontFamily}`
      ctx.fillText(bestAgainst[0].name, enemyCenter + 10, row5Y + 3)
      
      ctx.fillStyle = '#f5222d'
      ctx.font = `bold 16px ${fontFamily}`
      ctx.fillText(`${bestAgainst[0].winRate}%`, enemyCenter + 90, row5Y + 3)
      
      // 下行：战绩
      ctx.fillStyle = '#999'
      ctx.font = `12px ${fontFamily}`
      ctx.fillText(`${bestAgainst[0].wins}胜${bestAgainst[0].losses}负`, enemyCenter, row5Y + 22)
    }

    // 合作搭档卡片 (305-555, 宽250)
    ctx.fillStyle = '#f0fff4'
    this.roundRect(ctx, 305, row5Y - 15, 250, 50, 10)
    ctx.fill()
    
    const partnerCountCenter = 305 + 125  // 卡片水平中心
    ctx.textAlign = 'center'
    
    // 上行：标签+人数
    ctx.fillStyle = '#52c41a'
    ctx.font = `bold 12px ${fontFamily}`
    ctx.fillText('合作搭档', partnerCountCenter - 50, row5Y + 3)
    
    ctx.fillStyle = '#333'
    ctx.font = `bold 18px ${fontFamily}`
    ctx.fillText(`${totalPartners} 人`, partnerCountCenter + 50, row5Y + 3)
    
    // 下行：首场日期
    ctx.fillStyle = '#999'
    ctx.font = `12px ${fontFamily}`
    ctx.fillText(`首场 ${firstMatchDate}`, partnerCountCenter, row5Y + 22)

    // ========== 底部信息 ==========
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `14px ${fontFamily}`
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
    ctx.fillText(dateStr, 300, height - 50)

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = `12px ${fontFamily}`
    ctx.fillText('SALBC Badminton Club', 300, height - 30)

    // ========== 导出图片 ==========
    setTimeout(() => {
      wx.canvasToTempFilePath({
        canvas: canvas,
        success: (res) => {
          hideLoading()
          this.setData({
            shareImagePath: res.tempFilePath,
            showShareModal: true
          })
        },
        fail: (err) => {
          hideLoading()
          console.error('导出图片失败:', err)
          showError('生成失败')
        }
      })
    }, 150)
  },

  // 绘制圆角矩形
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.arcTo(x + width, y, x + width, y + radius, radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius)
    ctx.lineTo(x + radius, y + height)
    ctx.arcTo(x, y + height, x, y + height - radius, radius)
    ctx.lineTo(x, y + radius)
    ctx.arcTo(x, y, x + radius, y, radius)
    ctx.closePath()
  },

  // 保存到相册
  async saveToAlbum() {
    try {
      await wx.saveImageToPhotosAlbum({
        filePath: this.data.shareImagePath
      })
      showSuccess('已保存到相册')
      this.closeShareModal()
    } catch (err) {
      if (err.errMsg.includes('auth deny')) {
        wx.showModal({
          title: '提示',
          content: '需要您授权保存图片到相册',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting()
            }
          }
        })
      } else {
        showError('保存失败')
      }
    }
  },

  // 关闭分享弹窗
  closeShareModal() {
    this.setData({ showShareModal: false })
  },

  // 分享个人战绩
  onShareAppMessage() {
    return {
      title: `${this.data.playerName} 的羽毛球战绩`,
      path: `/pages/player/player?name=${encodeURIComponent(this.data.playerName)}`
    }
  }
})
