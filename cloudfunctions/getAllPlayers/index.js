// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 🌟 云函数中可以一次性获取所有数据（无20条限制）
    const playersResult = await db.collection('players')
      .get()  // 云函数中 get() 默认最多1000条
    
    const matchesResult = await db.collection('matches')
      .where({ 
        createTime: _.gte(startOfDay) 
      })
      .field({ 
        teamA: true, 
        teamB: true 
      })
      .get()

    console.log('✅ 云函数获取球员数:', playersResult.data.length)
    console.log('✅ 云函数获取今日比赛数:', matchesResult.data.length)

    return {
      success: true,
      players: playersResult.data,
      todayMatches: matchesResult.data
    }
  } catch (err) {
    console.error('❌ 云函数执行失败:', err)
    return {
      success: false,
      errMsg: err.message
    }
  }
}