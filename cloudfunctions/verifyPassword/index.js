// cloudfunctions/verifyPassword/index.js
// 密码验证云函数 - 将敏感验证逻辑移到云端

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 密码配置（实际生产环境建议存储在数据库或环境变量中）
const MATCH_PASSWORD = '250856'

exports.main = async (event, context) => {
  const { password , type } = event

  try {
    // 验证密码类型
    if (type === 'match') {
      if (password === MATCH_PASSWORD) {
        return {
          success: true,
          message: '验证成功'
        }
      } else {
        return {
          success: false,
          errMsg: '密码错误'
        }
      }
    }

    return {
      success: false,
      errMsg: '未知的验证类型'
    }
  } catch (err) {
    console.error('verifyPassword 错误:', err)
    return {
      success: false,
      errMsg: err.message
    }
  }
}
