// app.js
App({
  globalData: {
    needRefreshHistory: false  // 标记是否需要刷新历史记录页面
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-8g6mkkzg0e3682d1',  // 固定云环境ID，确保所有版本使用同一环境
        traceUser: true,
      })
    }
  }
})