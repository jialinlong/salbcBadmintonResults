// cloudfunctions/getMatchStats/index.js
// 统一处理比赛统计数据的云函数

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 获取所有比赛数据 (云函数无20条限制，最多1000条)
 */
async function getAllMatches(condition = {}) {
  const MAX_LIMIT = 1000
  let allData = []
  let skip = 0

  while (true) {
    const res = await db.collection('matches')
      .where(condition)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(MAX_LIMIT)
      .get()

    allData = allData.concat(res.data)

    if (res.data.length < MAX_LIMIT) {
      break
    }
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
  const { type, filterDate, filterPlayer, tab, page = 0, pageSize = 20 } = event

  try {
    switch (type) {
      // 获取历史记录的筛选条件数据
      case 'getFilterOptions': {
        const allMatches = await getAllMatches()
        const dates = extractUniqueDates(allMatches)
        const players = extractUniquePlayers(allMatches)

        return {
          success: true,
          dates,
          players,
          totalCount: allMatches.length
        }
      }

      // 获取历史记录列表（支持分页）
      case 'getHistoryMatches': {
        let query = db.collection('matches')

        // 日期筛选
        if (filterDate) {
          const startDate = new Date(filterDate.replace(/-/g, '/') + ' 00:00:00')
          const endDate = new Date(filterDate.replace(/-/g, '/') + ' 23:59:59')
          query = query.where({
            createTime: _.gte(startDate).and(_.lte(endDate))
          })
        }

        // 玩家筛选
        if (filterPlayer) {
          const playerCondition = { name: filterPlayer }
          query = query.where(
            _.or([
              { teamA: _.elemMatch(playerCondition) },
              { teamB: _.elemMatch(playerCondition) }
            ])
          )
        }

        // 分页查询
        const res = await query
          .orderBy('createTime', 'desc')
          .skip(page * pageSize)
          .limit(pageSize)
          .get()

        return {
          success: true,
          matches: res.data,
          count: res.data.length,
          hasMore: res.data.length >= pageSize
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
    console.error('getMatchStats 错误:', err)
    return {
      success: false,
      errMsg: err.message
    }
  }
}
