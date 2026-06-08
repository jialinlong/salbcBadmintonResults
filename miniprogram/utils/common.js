// utils/common.js - 公共工具函数库

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`
}

/**
 * 格式化时间为 HH:mm
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(date) {
  const h = date.getHours()
  const min = date.getMinutes()
  return `${h < 10 ? '0' + h : h}:${min < 10 ? '0' + min : min}`
}

/**
 * 显示加载提示
 * @param {string} title - 提示文字
 */
function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true })
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading()
}

/**
 * 显示成功提示
 * @param {string} title - 提示文字
 */
function showSuccess(title) {
  wx.showToast({ title, icon: 'success' })
}

/**
 * 显示错误提示
 * @param {string} title - 提示文字
 */
function showError(title) {
  wx.showToast({ title, icon: 'none' })
}

/**
 * 调用云函数的通用包装器
 * @param {string} name - 云函数名称
 * @param {object} data - 传递的数据
 * @param {object} options - 配置选项
 * @returns {Promise} 云函数返回结果
 */
async function callCloudFunction(name, data = {}, options = {}) {
  const { showLoadingText, showErrorToast = true } = options
  
  if (showLoadingText) {
    showLoading(showLoadingText)
  }

  try {
    const res = await wx.cloud.callFunction({ name, data })
    
    if (showLoadingText) {
      hideLoading()
    }

    if (res.result && res.result.success === false) {
      const errMsg = res.result.errMsg || res.result.msg || '操作失败'
      if (showErrorToast) {
        showError(errMsg)
      }
      throw new Error(errMsg)
    }

    return res.result
  } catch (err) {
    if (showLoadingText) {
      hideLoading()
    }
    
    console.error(`云函数 ${name} 调用失败:`, err)
    
    if (showErrorToast) {
      showError('网络异常，请重试')
    }
    
    throw err
  }
}

/**
 * 计算比赛积分和标签
 * @param {number} winnerScore - 胜方得分
 * @param {number} loserScore - 败方得分
 * @returns {object} { points: 积分, tag: 标签 }
 */
function calculateMatchPoints(winnerScore, loserScore) {
  if (loserScore < 6) {
    return { points: 4, tag: '梦游局' }
  } else if (loserScore < 11) {
    return { points: 2, tag: '碾压局' }
  } else {
    return { points: 1, tag: '标准局' }
  }
}

/**
 * 防抖函数
 * @param {function} fn - 需要防抖的函数
 * @param {number} delay - 延迟时间(ms)
 * @returns {function} 防抖后的函数
 */
function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {function} fn - 需要节流的函数
 * @param {number} delay - 间隔时间(ms)
 * @returns {function} 节流后的函数
 */
function throttle(fn, delay = 300) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

module.exports = {
  formatDate,
  formatTime,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  callCloudFunction,
  calculateMatchPoints,
  debounce,
  throttle
}
