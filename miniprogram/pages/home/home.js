Page({
  goToMatch() {
    wx.navigateTo({ url: '/pages/match/match' })
  },
  goToAddPlayer() {
    wx.navigateTo({ url: '/pages/addPlayer/index' })
  },
  goToRank() {
    wx.navigateTo({ url: '/pages/rank/rank' })
  },
  goToHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  }
})