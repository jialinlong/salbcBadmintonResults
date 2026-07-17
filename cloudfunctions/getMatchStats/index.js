// cloudfunctions/getMatchStats/index.js
// 统一处理比赛统计数据的云函数

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
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

/**
 * 获取所有比赛数据 (云函数无20条限制，最多1000条)
 */
async function getAllMatches(condition = {}, perf = null, fields = null) {
  const MAX_LIMIT = 1000
  let allData = []
  let skip = 0

  while (true) {
    const batchStart = Date.now()
    let query = db.collection('matches')
      .where(condition)
      .orderBy('createTime', 'desc')
    if (fields) query = query.field(fields)
    const res = await query
      .skip(skip)
      .limit(MAX_LIMIT)
      .get()

    allData = allData.concat(res.data)
    if (perf) {
      perfLog(perf.scope, perf.traceId, 'cloud:matches-batch:end', {
        durationMs: Date.now() - batchStart,
        batch: skip / MAX_LIMIT,
        batchCount: res.data.length,
        totalCount: allData.length
      })
    }

    if (res.data.length < MAX_LIMIT) {
      break
    }
    skip += MAX_LIMIT
  }

  return allData
}

/**
 * 构造玩家筛选条件（出现在 teamA 或 teamB 中）
 */
function buildPlayerCondition(filterPlayer) {
  return _.or([
    { teamA: _.elemMatch({ name: filterPlayer }) },
    { teamB: _.elemMatch({ name: filterPlayer }) }
  ])
}

/**
 * 拉取指定时间范围内的全部比赛（可叠加玩家筛选），自动翻页突破单次1000条限制
 */
async function getMatchesInRange(startDate, endDate, filterPlayer, perf = null) {
  const MAX_LIMIT = 1000
  let allData = []
  let skip = 0

  while (true) {
    const batchStart = Date.now()
    let query = db.collection('matches').where({
      createTime: _.gte(startDate).and(_.lte(endDate))
    })

    if (filterPlayer) {
      query = query.where(buildPlayerCondition(filterPlayer))
    }

    const res = await query
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(MAX_LIMIT)
      .get()

    allData = allData.concat(res.data)
    if (perf) {
      perfLog(perf.scope, perf.traceId, 'cloud:matches-range-batch:end', {
        durationMs: Date.now() - batchStart,
        batch: skip / MAX_LIMIT,
        batchCount: res.data.length,
        totalCount: allData.length
      })
    }

    if (res.data.length < MAX_LIMIT) break
    skip += MAX_LIMIT
  }

  return allData
}

/**
 * 提取所有不重复的日期
 */
function extractUniqueDates(matches) {
  const datesSet = new Set()
  
  matches.forEach(match => {
    const d = new Date(match.createTime)
    const dateStr = formatDate(d)
    datesSet.add(dateStr)
  })

  return Array.from(datesSet).sort((a, b) => new Date(b) - new Date(a))
}

/**
 * 提取所有不重复的玩家名
 */
function extractUniquePlayers(matches) {
  const namesSet = new Set()
  
  matches.forEach(match => {
    if (match.teamA) {
      match.teamA.forEach(p => p.name && namesSet.add(p.name))
    }
    if (match.teamB) {
      match.teamB.forEach(p => p.name && namesSet.add(p.name))
    }
  })

  return Array.from(namesSet).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

/**
 * 计算排行榜统计数据
 */
function calculateRankStats(matches) {
  const stats = {}

  matches.forEach(m => {
    const scoreA = parseInt(m.scoreA) || 0
    const scoreB = parseInt(m.scoreB) || 0
    const diff = Math.abs(scoreA - scoreB)

    const winners = m.winner === 'A' ? m.teamA : m.teamB
    const losers = m.winner === 'A' ? m.teamB : m.teamA

    winners.forEach(p => {
      if (!stats[p.name]) {
        stats[p.name] = { name: p.name, wins: 0, losses: 0, matches: 0, netScore: 0 }
      }
      stats[p.name].wins++
      stats[p.name].matches++
      stats[p.name].netScore += diff
    })

    losers.forEach(p => {
      if (!stats[p.name]) {
        stats[p.name] = { name: p.name, wins: 0, losses: 0, matches: 0, netScore: 0 }
      }
      stats[p.name].losses++
      stats[p.name].matches++
      stats[p.name].netScore -= diff
    })
  })

  // 计算胜率
  const allPlayers = Object.values(stats).map(item => {
    item.winRate = item.matches > 0 ? Math.round((item.wins / item.matches) * 100) : 0
    return item
  })

  return allPlayers
}

/**
 * 格式化日期
 */
function formatDate(date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`
}

// 云函数入口
exports.main = async (event, context) => {
  const { type, filterDate, filterPlayer, tab } = event
  const traceId = event.traceId || fallbackTraceId('history')
  const invokeStart = Date.now()
  const invocation = ++invocationCount
  const perf = { scope: 'history', traceId }
  let errorName
  perfLog('history', traceId, 'cloud:invoke:start', { invocation, type })

  try {
    switch (type) {
      // 获取历史记录的筛选条件数据
      case 'getFilterOptions': {
        const allMatches = await getAllMatches({}, perf, {
          createTime: true,
          teamA: true,
          teamB: true
        })
        const dates = extractUniqueDates(allMatches)
        const players = extractUniquePlayers(allMatches)

        return {
          success: true,
          dates,
          players,
          totalCount: allMatches.length
        }
      }

      // 按「天」分页获取历史记录（每页若干个完整自然日，保证当日结算准确）
      case 'getHistoryDays': {
        const TZ = '+08:00' // 与小程序客户端（中国时区）分组保持一致
        const daysPerPage = event.daysPerPage || 3
        const dayPage = event.dayPage || 0

        // 情况一：指定了具体日期，等价于只看这一天，无需按天翻页
        if (filterDate) {
          if (dayPage > 0) {
            return { success: true, matches: [], days: [], hasMore: false }
          }
          const startDate = new Date(`${filterDate}T00:00:00.000${TZ}`)
          const endDate = new Date(`${filterDate}T23:59:59.999${TZ}`)
          const matches = await getMatchesInRange(startDate, endDate, filterPlayer, perf)
          return {
            success: true,
            matches,
            days: matches.length ? [filterDate] : [],
            hasMore: false
          }
        }

        // 情况二：按天翻页。先用聚合算出本页对应的若干个自然日（只返回日期，开销小）
        const $ = db.command.aggregate
        const matchStage = filterPlayer ? buildPlayerCondition(filterPlayer) : {}

        const aggregateStart = Date.now()
        const dayRes = await db.collection('matches')
          .aggregate()
          .match(matchStage)
          .project({
            day: $.dateToString({ date: '$createTime', format: '%Y-%m-%d', timezone: TZ })
          })
          .group({ _id: '$day' })
          .sort({ _id: -1 })
          .skip(dayPage * daysPerPage)
          .limit(daysPerPage + 1) // 多取1天用于判断是否还有更多
          .end()
        perfLog('history', traceId, 'cloud:days-aggregate:end', {
          durationMs: Date.now() - aggregateStart,
          dayCount: dayRes.list.length
        })

        const allDays = dayRes.list.map(d => d._id)

        if (allDays.length === 0) {
          return { success: true, matches: [], days: [], hasMore: false }
        }

        const hasMore = allDays.length > daysPerPage
        const days = hasMore ? allDays.slice(0, daysPerPage) : allDays

        // 这些自然日在排序后是连续的，用 [最旧日 00:00, 最新日 23:59] 区间即可取全
        const maxDay = days[0]                 // 最新
        const minDay = days[days.length - 1]   // 最旧
        const startDate = new Date(`${minDay}T00:00:00.000${TZ}`)
        const endDate = new Date(`${maxDay}T23:59:59.999${TZ}`)

        const matches = await getMatchesInRange(startDate, endDate, filterPlayer, perf)

        return {
          success: true,
          matches,
          days,
          hasMore
        }
      }

      // 获取排行榜数据
      case 'getRankings': {
        let condition = {}

        // 本月筛选
        if (tab === 'month') {
          const now = new Date()
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
          condition.createTime = _.gte(startOfMonth)
        }

        const matches = await getAllMatches(condition)
        const allPlayers = calculateRankStats(matches)

        // 根据Tab决定最低场次要求
        const minMatches = tab === 'month' ? 5 : 10
        const qualifiedPlayers = allPlayers.filter(p => p.matches >= minMatches)

        // 排序：胜率 > 场次
        qualifiedPlayers.sort((a, b) => {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate
          return b.matches - a.matches
        })

        // 计算荣誉榜
        const sortedByMatches = [...qualifiedPlayers].sort((a, b) => b.matches - a.matches)
        const sortedByWinRate = [...qualifiedPlayers].sort((a, b) => {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate
          return b.matches - a.matches
        })
        const sortedByScore = [...qualifiedPlayers].sort((a, b) => b.netScore - a.netScore)

        return {
          success: true,
          rankList: qualifiedPlayers,
          mostActive: sortedByMatches[0] || {},
          bestPlayer: sortedByWinRate[0] || {},
          topScorer: sortedByScore[0] || {},
          totalMatches: matches.length,
          totalPlayers: allPlayers.length
        }
      }

      default:
        return { success: false, errMsg: '未知的操作类型' }
    }
  } catch (err) {
    errorName = err && err.name
    console.error('getMatchStats 错误:', err)
    return {
      success: false,
      errMsg: err.message
    }
  } finally {
    perfLog('history', traceId, errorName ? 'cloud:invoke:error' : 'cloud:invoke:end', {
      durationMs: Date.now() - invokeStart,
      invocation,
      type,
      errorName
    })
  }
}
