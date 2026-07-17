// 云函数入口文件
const cloud = require('wx-server-sdk')
const { loadPlayersAndMatches } = require('./queries')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
let invocationCount = 0

function fallbackTraceId(scope) {
  return `${scope}-cloud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function perfLog(scope, traceId, stage, fields = {}) {
  const suffix = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.log(`[PERF][${scope}][${traceId}] ${stage}${suffix ? ` ${suffix}` : ''}`)
}

// 云函数入口函数
exports.main = async (event, context) => {
  const traceId = event.traceId || fallbackTraceId('match')
  const invokeStart = Date.now()
  const invocation = ++invocationCount
  let errorName
  perfLog('match', traceId, 'cloud:invoke:start', { invocation })

  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 两个查询互不依赖，并行执行以缩短总等待时间
    const playersQueryStart = Date.now()
    const todayMatchesQueryStart = Date.now()
    const [playersResult, matchesResult] = await loadPlayersAndMatches(
      async () => {
        const result = await db.collection('players')
          .limit(1000)
          .get()
        perfLog('match', traceId, 'cloud:players-query:end', {
          durationMs: Date.now() - playersQueryStart,
          count: result.data.length
        })
        return result
      },
      async () => {
        const result = await db.collection('matches')
          .where({
            createTime: _.gte(startOfDay)
          })
          .field({
            teamA: true,
            teamB: true
          })
          .get()
        perfLog('match', traceId, 'cloud:today-matches-query:end', {
          durationMs: Date.now() - todayMatchesQueryStart,
          count: result.data.length
        })
        return result
      }
    )

    console.log('✅ 云函数获取球员数:', playersResult.data.length)
    console.log('✅ 云函数获取今日比赛数:', matchesResult.data.length)

    return {
      success: true,
      players: playersResult.data,
      todayMatches: matchesResult.data
    }
  } catch (err) {
    errorName = err && err.name
    console.error('❌ 云函数执行失败:', err)
    return {
      success: false,
      errMsg: err.message
    }
  } finally {
    perfLog('match', traceId, errorName ? 'cloud:invoke:error' : 'cloud:invoke:end', {
      durationMs: Date.now() - invokeStart,
      invocation,
      errorName
    })
  }
}
