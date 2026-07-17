// utils/cache.js - 缓存管理工具

/**
 * 缓存配置
 */
const CACHE_CONFIG = {
  // 记录比赛页球员缓存 - 5分钟
  matchPlayers: {
    key: 'cache_match_players',
    ttl: 5 * 60 * 1000
  },
  // 排行榜缓存 - 5分钟
  rankings: {
    key: 'cache_rankings',
    ttl: 5 * 60 * 1000
  },
  // 个人数据缓存 - 3分钟
  playerStats: {
    key: 'cache_player_stats',
    ttl: 3 * 60 * 1000
  },
  // 筛选选项缓存 - 10分钟
  filterOptions: {
    key: 'cache_filter_options',
    ttl: 10 * 60 * 1000
  }
}

/**
 * 设置缓存
 * @param {string} type - 缓存类型
 * @param {any} data - 缓存数据
 * @param {string} subKey - 子键(可选,用于区分不同参数的缓存)
 */
function setCache(type, data, subKey = '') {
  const config = CACHE_CONFIG[type]
  if (!config) return

  const cacheKey = subKey ? `${config.key}_${subKey}` : config.key
  const cacheData = {
    data,
    timestamp: Date.now(),
    ttl: config.ttl
  }

  try {
    wx.setStorageSync(cacheKey, cacheData)
  } catch (err) {
    console.error('设置缓存失败:', err)
  }
}

/**
 * 获取缓存
 * @param {string} type - 缓存类型
 * @param {string} subKey - 子键(可选)
 * @returns {any|null} 缓存数据,如果过期或不存在则返回null
 */
function getCache(type, subKey = '') {
  const config = CACHE_CONFIG[type]
  if (!config) return null

  const cacheKey = subKey ? `${config.key}_${subKey}` : config.key

  try {
    const cacheData = wx.getStorageSync(cacheKey)
    if (!cacheData) return null

    const now = Date.now()
    const isExpired = now - cacheData.timestamp > cacheData.ttl

    if (isExpired) {
      wx.removeStorageSync(cacheKey)
      return null
    }

    return cacheData.data
  } catch (err) {
    console.error('获取缓存失败:', err)
    return null
  }
}

/**
 * 清除指定类型的缓存
 * @param {string} type - 缓存类型
 * @param {string} subKey - 子键(可选)
 */
function clearCache(type, subKey = '') {
  const config = CACHE_CONFIG[type]
  if (!config) return

  const cacheKey = subKey ? `${config.key}_${subKey}` : config.key

  try {
    wx.removeStorageSync(cacheKey)
  } catch (err) {
    console.error('清除缓存失败:', err)
  }
}

/**
 * 清除所有缓存
 */
function clearAllCache() {
  Object.keys(CACHE_CONFIG).forEach(type => {
    clearCache(type)
  })
}

/**
 * 清除过期缓存(可在app启动时调用)
 */
function clearExpiredCache() {
  try {
    const info = wx.getStorageInfoSync()
    const now = Date.now()

    info.keys.forEach(key => {
      if (key.startsWith('cache_')) {
        try {
          const data = wx.getStorageSync(key)
          if (data && data.timestamp && data.ttl) {
            if (now - data.timestamp > data.ttl) {
              wx.removeStorageSync(key)
            }
          }
        } catch (err) {
          // 忽略单个key的错误
        }
      }
    })
  } catch (err) {
    console.error('清除过期缓存失败:', err)
  }
}

module.exports = {
  setCache,
  getCache,
  clearCache,
  clearAllCache,
  clearExpiredCache
}
